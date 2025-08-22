(function() {
  // Node.js Implementation
  var CoffeeScript, ext, fs, helpers, i, len, path, ref, universalCompile, vm,
    hasProp = {}.hasOwnProperty;

  CoffeeScript = require('./coffeescript');

  fs = require('fs');

  vm = require('vm');

  path = require('path');

  helpers = CoffeeScript.helpers;

  CoffeeScript.transpile = function(js, options) {
    var babel;
    try {
      babel = require('@babel/core');
    } catch (error) {
      try {
        babel = require('babel-core');
      } catch (error) {
        // This error is only for Node, as CLI users will see a different error
        // earlier if they don’t have Babel installed.
        throw new Error('To use the transpile option, you must have the \'@babel/core\' module installed');
      }
    }
    return babel.transform(js, options);
  };

  // The `compile` method shared by the CLI, Node and browser APIs.
  universalCompile = CoffeeScript.compile;

  // The `compile` method particular to the Node API.
  CoffeeScript.compile = function(code, options, handler = null) {
    // Pass a reference to Babel into the compiler, so that the transpile option
    // is available in the Node API. We need to do this so that tools like Webpack
    // can `require('coffeescript')` and build correctly, without trying to
    // require Babel.
    // console.log 'Ωcs___1', 'CoffeeScript.compile()', handler
    if (options != null ? options.transpile : void 0) {
      options.transpile.transpile = CoffeeScript.transpile;
    }
    return universalCompile.call(CoffeeScript, code, options, handler);
  };

  // Compile and execute a string of CoffeeScript (on the server), correctly
  // setting `__filename`, `__dirname`, and relative `require()`.
  CoffeeScript.run = function(code, options = {}) {
    var answer, dir, mainModule, ref;
    // console.log 'Ωcs___2', 'CoffeeScript.run()'
    mainModule = require.main;
    // Set the filename.
    mainModule.filename = process.argv[1] = options.filename ? fs.realpathSync(options.filename) : helpers.anonymousFileName();
    // Clear the module cache.
    mainModule.moduleCache && (mainModule.moduleCache = {});
    // Assign paths for node_modules loading
    dir = options.filename != null ? path.dirname(fs.realpathSync(options.filename)) : fs.realpathSync('.');
    mainModule.paths = require('module')._nodeModulePaths(dir);
    // Save the options for compiling child imports.
    mainModule.options = options;
    options.filename = mainModule.filename;
    options.inlineMap = true;
    // Compile.
    answer = CoffeeScript.compile(code, options);
    code = (ref = answer.js) != null ? ref : answer;
    return mainModule._compile(code, mainModule.filename);
  };

  // Compile and evaluate a string of CoffeeScript (in a Node.js-like environment).
  // The CoffeeScript REPL uses this to run the input.
  CoffeeScript.eval = function(code, options = {}) {
    var Module, _module, _require, createContext, i, isContext, js, k, len, o, r, ref, ref1, ref2, ref3, sandbox, v;
    if (!(code = code.trim())) {
      return;
    }
    createContext = (ref = vm.Script.createContext) != null ? ref : vm.createContext;
    isContext = (ref1 = vm.isContext) != null ? ref1 : function(ctx) {
      return options.sandbox instanceof createContext().constructor;
    };
    if (createContext) {
      if (options.sandbox != null) {
        if (isContext(options.sandbox)) {
          sandbox = options.sandbox;
        } else {
          sandbox = createContext();
          ref2 = options.sandbox;
          for (k in ref2) {
            if (!hasProp.call(ref2, k)) continue;
            v = ref2[k];
            sandbox[k] = v;
          }
        }
        sandbox.global = sandbox.root = sandbox.GLOBAL = sandbox;
      } else {
        sandbox = global;
      }
      sandbox.__filename = options.filename || 'eval';
      sandbox.__dirname = path.dirname(sandbox.__filename);
      // define module/require only if they chose not to specify their own
      if (!(sandbox !== global || sandbox.module || sandbox.require)) {
        Module = require('module');
        sandbox.module = _module = new Module(options.modulename || 'eval');
        sandbox.require = _require = function(path) {
          return Module._load(path, _module, true);
        };
        _module.filename = sandbox.__filename;
        ref3 = Object.getOwnPropertyNames(require);
        for (i = 0, len = ref3.length; i < len; i++) {
          r = ref3[i];
          if (r !== 'paths' && r !== 'arguments' && r !== 'caller') {
            _require[r] = require[r];
          }
        }
        // use the same hack node currently uses for their own REPL
        _require.paths = _module.paths = Module._nodeModulePaths(process.cwd());
        _require.resolve = function(request) {
          return Module._resolveFilename(request, _module);
        };
      }
    }
    o = {};
    for (k in options) {
      if (!hasProp.call(options, k)) continue;
      v = options[k];
      o[k] = v;
    }
    o.bare = true; // ensure return value
    js = CoffeeScript.compile(code, o);
    if (sandbox === global) {
      return vm.runInThisContext(js);
    } else {
      return vm.runInContext(js, sandbox);
    }
  };

  CoffeeScript.register = function() {
    return require('./register');
  };

  // Throw error with deprecation warning when depending upon implicit `require.extensions` registration
  if (require.extensions) {
    ref = CoffeeScript.FILE_EXTENSIONS;
    for (i = 0, len = ref.length; i < len; i++) {
      ext = ref[i];
      (function(ext) {
        var base;
        return (base = require.extensions)[ext] != null ? base[ext] : base[ext] = function() {
          throw new Error(`Use CoffeeScript.register() or require the coffeescript/register module to require ${ext} files.`);
        };
      })(ext);
    }
  }

  CoffeeScript._compileRawFileContent = function(raw, filename, options = {}) {
    var answer, err, stripped;
    // console.log 'Ωcs___3', 'CoffeeScript._compileRawFileContent()'
    // Strip the Unicode byte order mark, if this file begins with one.
    stripped = raw.charCodeAt(0) === 0xFEFF ? raw.substring(1) : raw;
    options = Object.assign({}, options, {
      filename: filename,
      literate: helpers.isLiterate(filename),
      sourceFiles: [filename]
    });
    try {
      answer = CoffeeScript.compile(stripped, options);
    } catch (error) {
      err = error;
      // As the filename and code of a dynamically loaded file will be different
      // from the original file compiled with CoffeeScript.run, add that
      // information to error so it can be pretty-printed later.
      throw helpers.updateSyntaxError(err, stripped, filename);
    }
    return answer;
  };

  CoffeeScript._compileFile = function(filename, options = {}) {
    var raw;
    // console.log 'Ωcs___4', 'CoffeeScript._compileFile()'
    raw = fs.readFileSync(filename, 'utf8');
    return CoffeeScript._compileRawFileContent(raw, filename, options);
  };

  module.exports = CoffeeScript;

  // Explicitly define all named exports so that Node’s automatic detection of
  // named exports from CommonJS packages finds all of them. This enables consuming
  // packages to write code like `import { compile } from 'coffeescript'`.
  // Don’t simplify this into a loop or similar; the `module.exports.name` part is
  // essential for Node’s algorithm to successfully detect the name.
  module.exports.VERSION = CoffeeScript.VERSION;

  module.exports.FILE_EXTENSIONS = CoffeeScript.FILE_EXTENSIONS;

  module.exports.helpers = CoffeeScript.helpers;

  module.exports.registerCompiled = CoffeeScript.registerCompiled;

  module.exports.compile = CoffeeScript.compile;

  module.exports.tokens = CoffeeScript.tokens;

  module.exports.nodes = CoffeeScript.nodes;

  module.exports.register = CoffeeScript.register;

  module.exports.eval = CoffeeScript.eval;

  module.exports.run = CoffeeScript.run;

  module.exports.transpile = CoffeeScript.transpile;

  module.exports.patchStackTrace = CoffeeScript.patchStackTrace;

  module.exports._compileRawFileContent = CoffeeScript._compileRawFileContent;

  module.exports._compileFile = CoffeeScript._compileFile;

}).call(this);

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2luZGV4LmNvZmZlZSJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBd0I7RUFBQTtBQUFBLE1BQUEsWUFBQSxFQUFBLEdBQUEsRUFBQSxFQUFBLEVBQUEsT0FBQSxFQUFBLENBQUEsRUFBQSxHQUFBLEVBQUEsSUFBQSxFQUFBLEdBQUEsRUFBQSxnQkFBQSxFQUFBLEVBQUE7SUFBQTs7RUFDeEIsWUFBQSxHQUFnQixPQUFBLENBQVEsZ0JBQVI7O0VBQ2hCLEVBQUEsR0FBZ0IsT0FBQSxDQUFRLElBQVI7O0VBQ2hCLEVBQUEsR0FBZ0IsT0FBQSxDQUFRLElBQVI7O0VBQ2hCLElBQUEsR0FBZ0IsT0FBQSxDQUFRLE1BQVI7O0VBRWhCLE9BQUEsR0FBZ0IsWUFBWSxDQUFDOztFQUU3QixZQUFZLENBQUMsU0FBYixHQUF5QixRQUFBLENBQUMsRUFBRCxFQUFLLE9BQUwsQ0FBQTtBQUN6QixRQUFBO0FBQUU7TUFDRSxLQUFBLEdBQVEsT0FBQSxDQUFRLGFBQVIsRUFEVjtLQUVBLGFBQUE7QUFDRTtRQUNFLEtBQUEsR0FBUSxPQUFBLENBQVEsWUFBUixFQURWO09BRUEsYUFBQTs7O1FBR0UsTUFBTSxJQUFJLEtBQUosQ0FBVSxpRkFBVixFQUhSO09BSEY7O1dBT0EsS0FBSyxDQUFDLFNBQU4sQ0FBZ0IsRUFBaEIsRUFBb0IsT0FBcEI7RUFWdUIsRUFSRDs7O0VBcUJ4QixnQkFBQSxHQUFtQixZQUFZLENBQUMsUUFyQlI7OztFQXVCeEIsWUFBWSxDQUFDLE9BQWIsR0FBdUIsUUFBQSxDQUFFLElBQUYsRUFBUSxPQUFSLEVBQWlCLFVBQVUsSUFBM0IsQ0FBQSxFQUFBOzs7Ozs7SUFNckIsc0JBQUcsT0FBTyxDQUFFLGtCQUFaO01BQ0UsT0FBTyxDQUFDLFNBQVMsQ0FBQyxTQUFsQixHQUE4QixZQUFZLENBQUMsVUFEN0M7O1dBRUEsZ0JBQWdCLENBQUMsSUFBakIsQ0FBc0IsWUFBdEIsRUFBb0MsSUFBcEMs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QUFNLEVBQUUsQ0FBQyxZQUFILENBQWdCLFFBQWhCLEVBQTBCLE1BQTFCO1dBRU4sWUFBWSxDQUFDLHNCQUFiLENBQW9DLEdBQXBDLEVBQXlDLFFBQXpDLEVBQW1ELE9BQW5EO0VBSjBCOztFQU01QixNQUFNLENBQUMsT0FBUCxHQUFpQixhQS9JTzs7Ozs7OztFQXNKeEIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFmLEdBQXlCLFlBQVksQ0FBQzs7RUFDdEMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxlQUFmLEdBQWlDLFlBQVksQ0FBQzs7RUFDOUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFmLEdBQXlCLFlBQVksQ0FBQzs7RUFDdEMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxnQkFBZixHQUFrQyxZQUFZLENBQUM7O0VBQy9DLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBZixHQUF5QixZQUFZLENBQUM7O0VBQ3RDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBZixHQUF3QixZQUFZLENBQUM7O0VBQ3JDLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBZixHQUF1QixZQUFZLENBQUM7O0VBQ3BDLE1BQU0sQ0FBQyxPQUFPLENBQUMsUUFBZixHQUEwQixZQUFZLENBQUM7O0VBQ3ZDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBZixHQUFzQixZQUFZLENBQUM7O0VBQ25DLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBZixHQUFxQixZQUFZLENBQUM7O0VBQ2xDLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBZixHQUEyQixZQUFZLENBQUM7O0VBQ3hDLE1BQU0sQ0FBQyxPQUFPLENBQUMsZUFBZixHQUFpQyxZQUFZLENBQUM7O0VBQzlDLE1BQU0sQ0FBQyxPQUFPLENBQUMsc0JBQWYsR0FBd0MsWUFBWSxDQUFDOztFQUNyRCxNQUFNLENBQUMsT0FBTyxDQUFDLFlBQWYsR0FBOEIsWUFBWSxDQUFDO0FBbktuQiIsInNvdXJjZXNDb250ZW50IjpbIiMgTm9kZS5qcyBJbXBsZW1lbnRhdGlvblxuQ29mZmVlU2NyaXB0ICA9IHJlcXVpcmUgJy4vY29mZmVlc2NyaXB0J1xuZnMgICAgICAgICAgICA9IHJlcXVpcmUgJ2ZzJ1xudm0gICAgICAgICAgICA9IHJlcXVpcmUgJ3ZtJ1xucGF0aCAgICAgICAgICA9IHJlcXVpcmUgJ3BhdGgnXG5cbmhlbHBlcnMgICAgICAgPSBDb2ZmZWVTY3JpcHQuaGVscGVyc1xuXG5Db2ZmZWVTY3JpcHQudHJhbnNwaWxlID0gKGpzLCBvcHRpb25zKSAtPlxuICB0cnlcbiAgICBiYWJlbCA9IHJlcXVpcmUgJ0BiYWJlbC9jb3JlJ1xuICBjYXRjaFxuICAgIHRyeVxuICAgICAgYmFiZWwgPSByZXF1aXJlICdiYWJlbC1jb3JlJ1xuICAgIGNhdGNoXG4gICAgICAjIFRoaXMgZXJyb3IgaXMgb25seSBmb3IgTm9kZSwgYXMgQ0xJIHVzZXJzIHdpbGwgc2VlIGEgZGlmZmVyZW50IGVycm9yXG4gICAgICAjIGVhcmxpZXIgaWYgdGhleSBkb27igJl0IGhhdmUgQmFiZWwgaW5zdGFsbGVkLlxuICAgICAgdGhyb3cgbmV3IEVycm9yICdUbyB1c2UgdGhlIHRyYW5zcGlsZSBvcHRpb24sIHlvdSBtdXN0IGhhdmUgdGhlIFxcJ0BiYWJlbC9jb3JlXFwnIG1vZHVsZSBpbnN0YWxsZWQnXG4gIGJhYmVsLnRyYW5zZm9ybSBqcywgb3B0aW9uc1xuXG4jIFRoZSBgY29tcGlsZWAgbWV0aG9kIHNoYXJlZCBieSB0aGUgQ0xJLCBOb2RlIGFuZCBicm93c2VyIEFQSXMuXG51bml2ZXJzYWxDb21waWxlID0gQ29mZmVlU2NyaXB0LmNvbXBpbGVcbiMgVGhlIGBjb21waWxlYCBtZXRob2QgcGFydGljdWxhciB0byB0aGUgTm9kZSBBUEkuXG5Db2ZmZWVTY3JpcHQuY29tcGlsZSA9ICggY29kZSwgb3B0aW9ucywgaGFuZGxlciA9IG51bGwgKSAtPlxuICAjIFBhc3MgYSByZWZlcmVuY2UgdG8gQmFiZWwgaW50byB0aGUgY29tcGlsZXIsIHNvIHRoYXQgdGhlIHRyYW5zcGlsZSBvcHRpb25cbiAgIyBpcyBhdmFpbGFibGUgaW4gdGhlIE5vZGUgQVBJLiBXZSBuZWVkIHRvIGRvIHRoaXMgc28gdGhhdCB0b29scyBsaWtlIFdlYnBhY2tcbiAgIyBjYW4gYHJlcXVpcmUoJ2NvZmZlZXNjcmlwdCcpYCBhbmQgYnVpbGQgY29ycmVjdGx5LCB3aXRob3V0IHRyeWluZyB0b1xuICAjIHJlcXVpcmUgQmFiZWwuXG4gICMgY29uc29sZS5sb2cgJ86pY3NfX18xJywgJ0NvZmZlZVNjcmlwdC5jb21waWxlKCknLCBoYW5kbGVyXG4gIGlmIG9wdGlvbnM/LnRyYW5zcGlsZVxuICAgIG9wdGlvbnMudHJhbnNwaWxlLnRyYW5zcGlsZSA9IENvZmZlZVNjcmlwdC50cmFuc3BpbGVcbiAgdW5pdmVyc2FsQ29tcGlsZS5jYWxsIENvZmZlZVNjcmlwdCwgY29kZSwgb3B0aW9ucywgaGFuZGxlclxuXG4jIENvbXBpbGUgYW5kIGV4ZWN1dGUgYSBzdHJpbmcgb2YgQ29mZmVlU2NyaXB0IChvbiB0aGUgc2VydmVyKSwgY29ycmVjdGx5XG4jIHNldHRpbmcgYF9fZmlsZW5hbWVgLCBgX19kaXJuYW1lYCwgYW5kIHJlbGF0aXZlIGByZXF1aXJlKClgLlxuQ29mZmVlU2NyaXB0LnJ1biA9IChjb2RlLCBvcHRpb25zID0ge30pIC0+XG4gICMgY29uc29sZS5sb2cgJ86pY3NfX18yJywgJ0NvZmZlZVNjcmlwdC5ydW4oKSdcbiAgbWFpbk1vZHVsZSA9IHJlcXVpcmUubWFpblxuXG4gICMgU2V0IHRoZSBmaWxlbmFtZS5cbiAgbWFpbk1vZHVsZS5maWxlbmFtZSA9IHByb2Nlc3MuYXJndlsxXSA9XG4gICAgaWYgb3B0aW9ucy5maWxlbmFtZSB0aGVuIGZzLnJlYWxwYXRoU3luYyhvcHRpb25zLmZpbGVuYW1lKSBlbHNlIGhlbHBlcnMuYW5vbnltb3VzRmlsZU5hbWUoKVxuXG4gICMgQ2xlYXIgdGhlIG1vZHVsZSBjYWNoZS5cbiAgbWFpbk1vZHVsZS5tb2R1bGVDYWNoZSBhbmQ9IHt9XG5cbiAgIyBBc3NpZ24gcGF0aHMgZm9yIG5vZGVfbW9kdWxlcyBsb2FkaW5nXG4gIGRpciA9IGlmIG9wdGlvbnMuZmlsZW5hbWU/XG4gICAgcGF0aC5kaXJuYW1lIGZzLnJlYWxwYXRoU3luYyBvcHRpb25zLmZpbGVuYW1lXG4gIGVsc2VcbiAgICBmcy5yZWFscGF0aFN5bmMgJy4nXG4gIG1haW5Nb2R1bGUucGF0aHMgPSByZXF1aXJlKCdtb2R1bGUnKS5fbm9kZU1vZHVsZVBhdGhzIGRpclxuXG4gICMgU2F2ZSB0aGUgb3B0aW9ucyBmb3IgY29tcGlsaW5nIGNoaWxkIGltcG9ydHMuXG4gIG1haW5Nb2R1bGUub3B0aW9ucyA9IG9wdGlvbnNcblxuICBvcHRpb25zLmZpbGVuYW1lID0gbWFpbk1vZHVsZS5maWxlbmFtZVxuICBvcHRpb25zLmlubGluZU1hcCA9IHRydWVcblxuICAjIENvbXBpbGUuXG4gIGFuc3dlciA9IENvZmZlZVNjcmlwdC5jb21waWxlIGNvZGUsIG9wdGlvbnNcbiAgY29kZSA9IGFuc3dlci5qcyA/IGFuc3dlclxuXG4gIG1haW5Nb2R1bGUuX2NvbXBpbGUgY29kZSwgbWFpbk1vZHVsZS5maWxlbmFtZVxuXG4jIENvbXBpbGUgYW5kIGV2YWx1YXRlIGEgc3RyaW5nIG9mIENvZmZlZVNjcmlwdCAoaW4gYSBOb2RlLmpzLWxpa2UgZW52aXJvbm1lbnQpLlxuIyBUaGUgQ29mZmVlU2NyaXB0IFJFUEwgdXNlcyB0aGlzIHRvIHJ1biB0aGUgaW5wdXQuXG5Db2ZmZWVTY3JpcHQuZXZhbCA9IChjb2RlLCBvcHRpb25zID0ge30pIC0+XG4gIHJldHVybiB1bmxlc3MgY29kZSA9IGNvZGUudHJpbSgpXG4gIGNyZWF0ZUNvbnRleHQgPSB2bS5TY3JpcHQuY3JlYXRlQ29udGV4dCA/IHZtLmNyZWF0ZUNvbnRleHRcblxuICBpc0NvbnRleHQgPSB2bS5pc0NvbnRleHQgPyAoY3R4KSAtPlxuICAgIG9wdGlvbnMuc2FuZGJveCBpbnN0YW5jZW9mIGNyZWF0ZUNvbnRleHQoKS5jb25zdHJ1Y3RvclxuXG4gIGlmIGNyZWF0ZUNvbnRleHRcbiAgICBpZiBvcHRpb25zLnNhbmRib3g/XG4gICAgICBpZiBpc0NvbnRleHQgb3B0aW9ucy5zYW5kYm94XG4gICAgICAgIHNhbmRib3ggPSBvcHRpb25zLnNhbmRib3hcbiAgICAgIGVsc2VcbiAgICAgICAgc2FuZGJveCA9IGNyZWF0ZUNvbnRleHQoKVxuICAgICAgICBzYW5kYm94W2tdID0gdiBmb3Igb3duIGssIHYgb2Ygb3B0aW9ucy5zYW5kYm94XG4gICAgICBzYW5kYm94Lmdsb2JhbCA9IHNhbmRib3gucm9vdCA9IHNhbmRib3guR0xPQkFMID0gc2FuZGJveFxuICAgIGVsc2VcbiAgICAgIHNhbmRib3ggPSBnbG9iYWxcbiAgICBzYW5kYm94Ll9fZmlsZW5hbWUgPSBvcHRpb25zLmZpbGVuYW1lIHx8ICdldmFsJ1xuICAgIHNhbmRib3guX19kaXJuYW1lICA9IHBhdGguZGlybmFtZSBzYW5kYm94Ll9fZmlsZW5hbWVcbiAgICAjIGRlZmluZSBtb2R1bGUvcmVxdWlyZSBvbmx5IGlmIHRoZXkgY2hvc2Ugbm90IHRvIHNwZWNpZnkgdGhlaXIgb3duXG4gICAgdW5sZXNzIHNhbmRib3ggaXNudCBnbG9iYWwgb3Igc2FuZGJveC5tb2R1bGUgb3Igc2FuZGJveC5yZXF1aXJlXG4gICAgICBNb2R1bGUgPSByZXF1aXJlICdtb2R1bGUnXG4gICAgICBzYW5kYm94Lm1vZHVsZSAgPSBfbW9kdWxlICA9IG5ldyBNb2R1bGUob3B0aW9ucy5tb2R1bGVuYW1lIHx8ICdldmFsJylcbiAgICAgIHNhbmRib3gucmVxdWlyZSA9IF9yZXF1aXJlID0gKHBhdGgpIC0+ICBNb2R1bGUuX2xvYWQgcGF0aCwgX21vZHVsZSwgdHJ1ZVxuICAgICAgX21vZHVsZS5maWxlbmFtZSA9IHNhbmRib3guX19maWxlbmFtZVxuICAgICAgZm9yIHIgaW4gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMgcmVxdWlyZSB3aGVuIHIgbm90IGluIFsncGF0aHMnLCAnYXJndW1lbnRzJywgJ2NhbGxlciddXG4gICAgICAgIF9yZXF1aXJlW3JdID0gcmVxdWlyZVtyXVxuICAgICAgIyB1c2UgdGhlIHNhbWUgaGFjayBub2RlIGN1cnJlbnRseSB1c2VzIGZvciB0aGVpciBvd24gUkVQTFxuICAgICAgX3JlcXVpcmUucGF0aHMgPSBfbW9kdWxlLnBhdGhzID0gTW9kdWxlLl9ub2RlTW9kdWxlUGF0aHMgcHJvY2Vzcy5jd2QoKVxuICAgICAgX3JlcXVpcmUucmVzb2x2ZSA9IChyZXF1ZXN0KSAtPiBNb2R1bGUuX3Jlc29sdmVGaWxlbmFtZSByZXF1ZXN0LCBfbW9kdWxlXG4gIG8gPSB7fVxuICBvW2tdID0gdiBmb3Igb3duIGssIHYgb2Ygb3B0aW9uc1xuICBvLmJhcmUgPSBvbiAjIGVuc3VyZSByZXR1cm4gdmFsdWVcbiAganMgPSBDb2ZmZWVTY3JpcHQuY29tcGlsZSBjb2RlLCBvXG4gIGlmIHNhbmRib3ggaXMgZ2xvYmFsXG4gICAgdm0ucnVuSW5UaGlzQ29udGV4dCBqc1xuICBlbHNlXG4gICAgdm0ucnVuSW5Db250ZXh0IGpzLCBzYW5kYm94XG5cbkNvZmZlZVNjcmlwdC5yZWdpc3RlciA9IC0+IHJlcXVpcmUgJy4vcmVnaXN0ZXInXG5cbiMgVGhyb3cgZXJyb3Igd2l0aCBkZXByZWNhdGlvbiB3YXJuaW5nIHdoZW4gZGVwZW5kaW5nIHVwb24gaW1wbGljaXQgYHJlcXVpcmUuZXh0ZW5zaW9uc2AgcmVnaXN0cmF0aW9uXG5pZiByZXF1aXJlLmV4dGVuc2lvbnNcbiAgZm9yIGV4dCBpbiBDb2ZmZWVTY3JpcHQuRklMRV9FWFRFTlNJT05TIHRoZW4gZG8gKGV4dCkgLT5cbiAgICByZXF1aXJlLmV4dGVuc2lvbnNbZXh0XSA/PSAtPlxuICAgICAgdGhyb3cgbmV3IEVycm9yIFwiXCJcIlxuICAgICAgVXNlIENvZmZlZVNjcmlwdC5yZWdpc3RlcigpIG9yIHJlcXVpcmUgdGhlIGNvZmZlZXNjcmlwdC9yZWdpc3RlciBtb2R1bGUgdG8gcmVxdWlyZSAje2V4dH0gZmlsZXMuXG4gICAgICBcIlwiXCJcblxuQ29mZmVlU2NyaXB0Ll9jb21waWxlUmF3RmlsZUNvbnRlbnQgPSAocmF3LCBmaWxlbmFtZSwgb3B0aW9ucyA9IHt9KSAtPlxuXG4gICMgY29uc29sZS5sb2cgJ86pY3NfX18zJywgJ0NvZmZlZVNjcmlwdC5fY29tcGlsZVJhd0ZpbGVDb250ZW50KCknXG4gICMgU3RyaXAgdGhlIFVuaWNvZGUgYnl0ZSBvcmRlciBtYXJrLCBpZiB0aGlzIGZpbGUgYmVnaW5zIHdpdGggb25lLlxuICBzdHJpcHBlZCA9IGlmIHJhdy5jaGFyQ29kZUF0KDApIGlzIDB4RkVGRiB0aGVuIHJhdy5zdWJzdHJpbmcgMSBlbHNlIHJhd1xuXG4gIG9wdGlvbnMgPSBPYmplY3QuYXNzaWduIHt9LCBvcHRpb25zLFxuICAgIGZpbGVuYW1lOiBmaWxlbmFtZVxuICAgIGxpdGVyYXRlOiBoZWxwZXJzLmlzTGl0ZXJhdGUgZmlsZW5hbWVcbiAgICBzb3VyY2VGaWxlczogW2ZpbGVuYW1lXVxuXG4gIHRyeVxuICAgIGFuc3dlciA9IENvZmZlZVNjcmlwdC5jb21waWxlIHN0cmlwcGVkLCBvcHRpb25zXG4gIGNhdGNoIGVyclxuICAgICMgQXMgdGhlIGZpbGVuYW1lIGFuZCBjb2RlIG9mIGEgZHluYW1pY2FsbHkgbG9hZGVkIGZpbGUgd2lsbCBiZSBkaWZmZXJlbnRcbiAgICAjIGZyb20gdGhlIG9yaWdpbmFsIGZpbGUgY29tcGlsZWQgd2l0aCBDb2ZmZWVTY3JpcHQucnVuLCBhZGQgdGhhdFxuICAgICMgaW5mb3JtYXRpb24gdG8gZXJyb3Igc28gaXQgY2FuIGJlIHByZXR0eS1wcmludGVkIGxhdGVyLlxuICAgIHRocm93IGhlbHBlcnMudXBkYXRlU3ludGF4RXJyb3IgZXJyLCBzdHJpcHBlZCwgZmlsZW5hbWVcblxuICBhbnN3ZXJcblxuQ29mZmVlU2NyaXB0Ll9jb21waWxlRmlsZSA9IChmaWxlbmFtZSwgb3B0aW9ucyA9IHt9KSAtPlxuICAjIGNvbnNvbGUubG9nICfOqWNzX19fNCcsICdDb2ZmZWVTY3JpcHQuX2NvbXBpbGVGaWxlKCknXG4gIHJhdyA9IGZzLnJlYWRGaWxlU3luYyBmaWxlbmFtZSwgJ3V0ZjgnXG5cbiAgQ29mZmVlU2NyaXB0Ll9jb21waWxlUmF3RmlsZUNvbnRlbnQgcmF3LCBmaWxlbmFtZSwgb3B0aW9uc1xuXG5tb2R1bGUuZXhwb3J0cyA9IENvZmZlZVNjcmlwdFxuXG4jIEV4cGxpY2l0bHkgZGVmaW5lIGFsbCBuYW1lZCBleHBvcnRzIHNvIHRoYXQgTm9kZeKAmXMgYXV0b21hdGljIGRldGVjdGlvbiBvZlxuIyBuYW1lZCBleHBvcnRzIGZyb20gQ29tbW9uSlMgcGFja2FnZXMgZmluZHMgYWxsIG9mIHRoZW0uIFRoaXMgZW5hYmxlcyBjb25zdW1pbmdcbiMgcGFja2FnZXMgdG8gd3JpdGUgY29kZSBsaWtlIGBpbXBvcnQgeyBjb21waWxlIH0gZnJvbSAnY29mZmVlc2NyaXB0J2AuXG4jIERvbuKAmXQgc2ltcGxpZnkgdGhpcyBpbnRvIGEgbG9vcCBvciBzaW1pbGFyOyB0aGUgYG1vZHVsZS5leHBvcnRzLm5hbWVgIHBhcnQgaXNcbiMgZXNzZW50aWFsIGZvciBOb2Rl4oCZcyBhbGdvcml0aG0gdG8gc3VjY2Vzc2Z1bGx5IGRldGVjdCB0aGUgbmFtZS5cbm1vZHVsZS5leHBvcnRzLlZFUlNJT04gPSBDb2ZmZWVTY3JpcHQuVkVSU0lPTlxubW9kdWxlLmV4cG9ydHMuRklMRV9FWFRFTlNJT05TID0gQ29mZmVlU2NyaXB0LkZJTEVfRVhURU5TSU9OU1xubW9kdWxlLmV4cG9ydHMuaGVscGVycyA9IENvZmZlZVNjcmlwdC5oZWxwZXJzXG5tb2R1bGUuZXhwb3J0cy5yZWdpc3RlckNvbXBpbGVkID0gQ29mZmVlU2NyaXB0LnJlZ2lzdGVyQ29tcGlsZWRcbm1vZHVsZS5leHBvcnRzLmNvbXBpbGUgPSBDb2ZmZWVTY3JpcHQuY29tcGlsZVxubW9kdWxlLmV4cG9ydHMudG9rZW5zID0gQ29mZmVlU2NyaXB0LnRva2Vuc1xubW9kdWxlLmV4cG9ydHMubm9kZXMgPSBDb2ZmZWVTY3JpcHQubm9kZXNcbm1vZHVsZS5leHBvcnRzLnJlZ2lzdGVyID0gQ29mZmVlU2NyaXB0LnJlZ2lzdGVyXG5tb2R1bGUuZXhwb3J0cy5ldmFsID0gQ29mZmVlU2NyaXB0LmV2YWxcbm1vZHVsZS5leHBvcnRzLnJ1biA9IENvZmZlZVNjcmlwdC5ydW5cbm1vZHVsZS5leHBvcnRzLnRyYW5zcGlsZSA9IENvZmZlZVNjcmlwdC50cmFuc3BpbGVcbm1vZHVsZS5leHBvcnRzLnBhdGNoU3RhY2tUcmFjZSA9IENvZmZlZVNjcmlwdC5wYXRjaFN0YWNrVHJhY2Vcbm1vZHVsZS5leHBvcnRzLl9jb21waWxlUmF3RmlsZUNvbnRlbnQgPSBDb2ZmZWVTY3JpcHQuX2NvbXBpbGVSYXdGaWxlQ29udGVudFxubW9kdWxlLmV4cG9ydHMuX2NvbXBpbGVGaWxlID0gQ29mZmVlU2NyaXB0Ll9jb21waWxlRmlsZVxuIl19
//# sourceURL=../src/index.coffee