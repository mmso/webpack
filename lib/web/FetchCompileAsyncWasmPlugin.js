/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const { WEBASSEMBLY_MODULE_TYPE_ASYNC } = require("../ModuleTypeConstants");
const RuntimeGlobals = require("../RuntimeGlobals");
const AsyncWasmLoadingRuntimeModule = require("../wasm-async/AsyncWasmLoadingRuntimeModule");
const Compilation = require("../Compilation");
const { SyncWaterfallHook } = require("tapable");

/**
 * @typedef {Object} CompilationHooks
 * @property {SyncWaterfallHook<string>} generateLoadBinaryCode
 */
/** @type {WeakMap<Compilation, CompilationHooks>} */
const compilationHooksMap = new WeakMap();

/** @typedef {import("../Chunk")} Chunk */
/** @typedef {import("../Compiler")} Compiler */

class FetchCompileAsyncWasmPlugin {
	/**
	 * @param {Compilation} compilation the compilation
	 * @returns {CompilationHooks} the attached hooks
	 */
	static getCompilationHooks(compilation) {
		if (!(compilation instanceof Compilation)) {
			throw new TypeError(
				"The 'compilation' argument must be an instance of Compilation"
			);
		}
		let hooks = compilationHooksMap.get(compilation);
		if (hooks === undefined) {
			hooks = {
				generateLoadBinaryCode: new SyncWaterfallHook(["source"])
			};
			compilationHooksMap.set(compilation, hooks);
		}
		return hooks;
	}

	/**
	 * Apply the plugin
	 * @param {Compiler} compiler the compiler instance
	 * @returns {void}
	 */
	apply(compiler) {
		compiler.hooks.thisCompilation.tap(
			"FetchCompileAsyncWasmPlugin",
			compilation => {
				const globalWasmLoading = compilation.outputOptions.wasmLoading;
				/**
				 * @param {Chunk} chunk chunk
				 * @returns {boolean} true, if wasm loading is enabled for the chunk
				 */
				const isEnabledForChunk = chunk => {
					const options = chunk.getEntryOptions();
					const wasmLoading =
						options && options.wasmLoading !== undefined
							? options.wasmLoading
							: globalWasmLoading;
					return wasmLoading === "fetch";
				};

				const hooks =
					FetchCompileAsyncWasmPlugin.getCompilationHooks(compilation);
				/**
				 * @param {string} path path to the wasm file
				 * @returns {string} code to load the wasm file
				 */
				const generateLoadBinaryCode = path =>
					hooks.generateLoadBinaryCode.call(
						`fetch(${RuntimeGlobals.publicPath} + ${path})`
					);

				compilation.hooks.runtimeRequirementInTree
					.for(RuntimeGlobals.instantiateWasm)
					.tap("FetchCompileAsyncWasmPlugin", (chunk, set) => {
						if (!isEnabledForChunk(chunk)) return;
						const chunkGraph = compilation.chunkGraph;
						if (
							!chunkGraph.hasModuleInGraph(
								chunk,
								m => m.type === WEBASSEMBLY_MODULE_TYPE_ASYNC
							)
						) {
							return;
						}
						set.add(RuntimeGlobals.publicPath);
						compilation.addRuntimeModule(
							chunk,
							new AsyncWasmLoadingRuntimeModule({
								generateLoadBinaryCode,
								supportsStreaming: true
							})
						);
					});
			}
		);
	}
}

module.exports = FetchCompileAsyncWasmPlugin;
