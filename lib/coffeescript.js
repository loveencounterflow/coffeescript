(function() {
  // CoffeeScript can be used both on the server, as a command-line compiler based
  // on Node.js/V8, or to run CoffeeScript directly in the browser. This module
  // contains the main entry functions for tokenizing, parsing, and compiling
  // source CoffeeScript into JavaScript.
  var FILE_EXTENSIONS, Lexer, SourceMap, base64encode, checkShebangLine, compile, getSourceMap, helpers, lexer, packageJson, parser, registerCompiled, withPrettyErrors;

  ({Lexer} = require('./lexer'));

  ({parser} = require('./parser'));

  helpers = require('./helpers');

  SourceMap = require('./sourcemap');

  // Require `package.json`, which is two levels above this file, as this file is
  // evaluated from `lib/coffeescript`.
  packageJson = require('../../package.json');

  // The current CoffeeScript version number.
  exports.VERSION = packageJson.version;

  exports.FILE_EXTENSIONS = FILE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];

  // Expose helpers for testing.
  exports.helpers = helpers;

  ({getSourceMap, registerCompiled} = SourceMap);

  // This is exported to enable an external module to implement caching of
  // sourcemaps. This is used only when `patchStackTrace` has been called to adjust
  // stack traces for files with cached source maps.
  exports.registerCompiled = registerCompiled;

  // Function that allows for btoa in both nodejs and the browser.
  base64encode = function(src) {
    switch (false) {
      case typeof Buffer !== 'function':
        return Buffer.from(src).toString('base64');
      case typeof btoa !== 'function':
        // The contents of a `<script>` block are encoded via UTF-16, so if any extended
        // characters are used in the block, btoa will fail as it maxes out at UTF-8.
        // See https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#The_Unicode_Problem
        // for the gory details, and for the solution implemented here.
        return btoa(encodeURIComponent(src).replace(/%([0-9A-F]{2})/g, function(match, p1) {
          return String.fromCharCode('0x' + p1);
        }));
      default:
        throw new Error('Unable to base64 encode inline sourcemap.');
    }
  };

  // Function wrapper to add source file information to SyntaxErrors thrown by the
  // lexer/parser/compiler.
  withPrettyErrors = function(fn) {
    return function(code, options = {}, handler = null) {
      var err;
      try {
        return fn.call(this, code, options, handler);
      } catch (error) {
        err = error;
        if (typeof code !== 'string') { // Support `CoffeeScript.nodes(tokens)`.
          throw err;
        }
        throw helpers.updateSyntaxError(err, code, options.filename);
      }
    };
  };

  // Compile CoffeeScript code to JavaScript, using the Coffee/Jison compiler.

  // If `options.sourceMap` is specified, then `options.filename` must also be
  // specified. All options that can be passed to `SourceMap#generate` may also
  // be passed here.

  // This returns a javascript string, unless `options.sourceMap` is passed,
  // in which case this returns a `{js, v3SourceMap, sourceMap}`
  // object, where sourceMap is a sourcemap.coffee#SourceMap object, handy for
  // doing programmatic lookups.
  exports.compile = compile = withPrettyErrors(function(code, options = {}, handler = null) { // !!!!!!!!!!
    var ast, currentColumn, currentLine, encoded, filename, fragment, fragments, generateSourceMap, header, i, j, js, len, len1, map, newLines, nodes, range, ref, sourceCodeLastLine, sourceCodeNumberOfLines, sourceMapDataURI, sourceURL, token, tokens, transpiler, transpilerOptions, transpilerOutput, v3SourceMap;
    // exports.compile = compile = withPrettyErrors (code, options = {}) ->
    // console.log 'ΩCS___1', "compile()", handler # !!!!!!!!!!!!!!!!!!
    // Clone `options`, to avoid mutating the `options` object passed in.
    options = Object.assign({}, options);
    generateSourceMap = options.sourceMap || options.inlineMap || (options.filename == null);
    filename = options.filename || helpers.anonymousFileName();
    checkShebangLine(filename, code);
    if (generateSourceMap) {
      map = new SourceMap();
    }
    tokens = lexer.tokenize(code, options);
    if (handler != null) {
      handler({tokens});
    }
    // Pass a list of referenced variables, so that generated variables won’t get
    // the same name.
    options.referencedVars = (function() {
      var i, len, results;
      results = [];
      for (i = 0, len = tokens.length; i < len; i++) {
        token = tokens[i];
        if (token[0] === 'IDENTIFIER') {
          results.push(token[1]);
        }
      }
      return results;
    })();
    // Check for import or export; if found, force bare mode.
    if (!((options.bare != null) && options.bare === true)) {
      for (i = 0, len = tokens.length; i < len; i++) {
        token = tokens[i];
        if ((ref = token[0]) === 'IMPORT' || ref === 'EXPORT') {
          options.bare = true;
          break;
        }
      }
    }
    nodes = parser.parse(tokens);
    // If all that was requested was a POJO representation of the nodes, e.g.
    // the abstract syntax tree (AST), we can stop now and just return that
    // (after fixing the location data for the root/`File`»`Program` node,
    // which might’ve gotten misaligned from the original source due to the
    // `clean` function in the lexer).
    if (options.ast) {
      nodes.allCommentTokens = helpers.extractAllCommentTokens(tokens);
      sourceCodeNumberOfLines = (code.match(/\r?\n/g) || '').length + 1;
      sourceCodeLastLine = /.*$/.exec(code)[0];
      ast = nodes.ast(options);
      range = [0, code.length];
      ast.start = ast.program.start = range[0];
      ast.end = ast.program.end = range[1];
      ast.range = ast.program.range = range;
      ast.loc.start = ast.program.loc.start = {
        line: 1,
        column: 0
      };
      ast.loc.end.line = ast.program.loc.end.line = sourceCodeNumberOfLines;
      ast.loc.end.column = ast.program.loc.end.column = sourceCodeLastLine.length;
      ast.tokens = tokens;
      return ast;
    }
    fragments = nodes.compileToFragments(options);
    currentLine = 0;
    if (options.header) {
      currentLine += 1;
    }
    if (options.shiftLine) {
      currentLine += 1;
    }
    currentColumn = 0;
    js = "";
    for (j = 0, len1 = fragments.length; j < len1; j++) {
      fragment = fragments[j];
      // Update the sourcemap with data from each fragment.
      if (generateSourceMap) {
        // Do not include empty, whitespace, or semicolon-only fragments.
        if (fragment.locationData && !/^[;\s]*$/.test(fragment.code)) {
          map.add([fragment.locationData.first_line, fragment.locationData.first_column], [currentLine, currentColumn], {
            noReplace: true
          });
        }
        newLines = helpers.count(fragment.code, "\n");
        currentLine += newLines;
        if (newLines) {
          currentColumn = fragment.code.length - (fragment.code.lastIndexOf("\n") + 1);
        } else {
          currentColumn += fragment.code.length;
        }
      }
      // Copy the code from each fragment into the final JavaScript.
      js += fragment.code;
    }
    if (options.header) {
      header = `Generated by CoffeeScript ${this.VERSION}`;
      js = `// ${header}\n${js}`;
    }
    if (generateSourceMap) {
      v3SourceMap = map.generate(options, code);
    }
    if (options.transpile) {
      if (typeof options.transpile !== 'object') {
        // This only happens if run via the Node API and `transpile` is set to
        // something other than an object.
        throw new Error('The transpile option must be given an object with options to pass to Babel');
      }
      // Get the reference to Babel that we have been passed if this compiler
      // is run via the CLI or Node API.
      transpiler = options.transpile.transpile;
      delete options.transpile.transpile;
      transpilerOptions = Object.assign({}, options.transpile);
      // See https://github.com/babel/babel/issues/827#issuecomment-77573107:
      // Babel can take a v3 source map object as input in `inputSourceMap`
      // and it will return an *updated* v3 source map object in its output.
      if (v3SourceMap && (transpilerOptions.inputSourceMap == null)) {
        transpilerOptions.inputSourceMap = v3SourceMap;
      }
      transpilerOutput = transpiler(js, transpilerOptions);
      js = transpilerOutput.code;
      if (v3SourceMap && transpilerOutput.map) {
        v3SourceMap = transpilerOutput.map;
      }
    }
    if (options.inlineMap) {
      encoded = base64encode(JSON.stringify(v3SourceMap));
      sourceMapDataURI = `//# sourceMappingURL=data:application/json;base64,${encoded}`;
      sourceURL = `//# sourceURL=${filename}`;
      js = `${js}\n${sourceMapDataURI}\n${sourceURL}`;
    }
    registerCompiled(filename, code, map);
    if (options.sourceMap) {
      return {
        js,
        sourceMap: map,
        v3SourceMap: JSON.stringify(v3SourceMap, null, 2)
      };
    } else {
      return js;
    }
  });

  // Tokenize a string of CoffeeScript code, and return the array of tokens.
  exports.tokens = withPrettyErrors(function(code, options) {
    return lexer.tokenize(code, options);
  });

  // Parse a string of CoffeeScript code or an array of lexed tokens, and
  // return the AST. You can then compile it by calling `.compile()` on the root,
  // or traverse it by using `.traverseChildren()` with a callback.
  exports.nodes = withPrettyErrors(function(source, options) {
    if (typeof source === 'string') {
      source = lexer.tokenize(source, options);
    }
    return parser.parse(source);
  });

  // This file used to export these methods; leave stubs that throw warnings
  // instead. These methods have been moved into `index.coffee` to provide
  // separate entrypoints for Node and non-Node environments, so that static
  // analysis tools don’t choke on Node packages when compiling for a non-Node
  // environment.
  exports.run = exports.eval = exports.register = function() {
    throw new Error('require index.coffee, not this file');
  };

  // Instantiate a Lexer for our use here.
  lexer = new Lexer();

  // The real Lexer produces a generic stream of tokens. This object provides a
  // thin wrapper around it, compatible with the Jison API. We can then pass it
  // directly as a “Jison lexer.”
  parser.lexer = {
    yylloc: {
      range: []
    },
    options: {
      ranges: true
    },
    lex: function() {
      var tag, token;
      token = parser.tokens[this.pos++];
      if (token) {
        [tag, this.yytext, this.yylloc] = token;
        parser.errorToken = token.origin || token;
        this.yylineno = this.yylloc.first_line;
      } else {
        tag = '';
      }
      return tag;
    },
    setInput: function(tokens) {
      parser.tokens = tokens;
      return this.pos = 0;
    },
    upcomingInput: function() {
      return '';
    }
  };

  // Make all the AST nodes visible to the parser.
  parser.yy = require('./nodes');

  // Override Jison's default error handling function.
  parser.yy.parseError = function(message, {token}) {
    var errorLoc, errorTag, errorText, errorToken, tokens;
    // Disregard Jison's message, it contains redundant line number information.
    // Disregard the token, we take its value directly from the lexer in case
    // the error is caused by a generated token which might refer to its origin.
    ({errorToken, tokens} = parser);
    [errorTag, errorText, errorLoc] = errorToken;
    errorText = (function() {
      switch (false) {
        case errorToken !== tokens[tokens.length - 1]:
          return 'end of input';
        case errorTag !== 'INDENT' && errorTag !== 'OUTDENT':
          return 'indentation';
        case errorTag !== 'IDENTIFIER' && errorTag !== 'NUMBER' && errorTag !== 'INFINITY' && errorTag !== 'STRING' && errorTag !== 'STRING_START' && errorTag !== 'REGEX' && errorTag !== 'REGEX_START':
          return errorTag.replace(/_START$/, '').toLowerCase();
        default:
          return helpers.nameWhitespaceCharacter(errorText);
      }
    })();
    // The second argument has a `loc` property, which should have the location
    // data for this token. Unfortunately, Jison seems to send an outdated `loc`
    // (from the previous token), so we take the location information directly
    // from the lexer.
    return helpers.throwSyntaxError(`unexpected ${errorText}`, errorLoc);
  };

  exports.patchStackTrace = function() {
    var formatSourcePosition, getSourceMapping;
    // Based on http://v8.googlecode.com/svn/branches/bleeding_edge/src/messages.js
    // Modified to handle sourceMap
    formatSourcePosition = function(frame, getSourceMapping) {
      var as, column, fileLocation, filename, functionName, isConstructor, isMethodCall, line, methodName, source, tp, typeName;
      filename = void 0;
      fileLocation = '';
      if (frame.isNative()) {
        fileLocation = "native";
      } else {
        if (frame.isEval()) {
          filename = frame.getScriptNameOrSourceURL();
          if (!filename) {
            fileLocation = `${frame.getEvalOrigin()}, `;
          }
        } else {
          filename = frame.getFileName();
        }
        filename || (filename = "<anonymous>");
        line = frame.getLineNumber();
        column = frame.getColumnNumber();
        // Check for a sourceMap position
        source = getSourceMapping(filename, line, column);
        fileLocation = source ? `${filename}:${source[0]}:${source[1]}` : `${filename}:${line}:${column}`;
      }
      functionName = frame.getFunctionName();
      isConstructor = frame.isConstructor();
      isMethodCall = !(frame.isToplevel() || isConstructor);
      if (isMethodCall) {
        methodName = frame.getMethodName();
        typeName = frame.getTypeName();
        if (functionName) {
          tp = as = '';
          if (typeName && functionName.indexOf(typeName)) {
            tp = `${typeName}.`;
          }
          if (methodName && functionName.indexOf(`.${methodName}`) !== functionName.length - methodName.length - 1) {
            as = ` [as ${methodName}]`;
          }
          return `${tp}${functionName}${as} (${fileLocation})`;
        } else {
          return `${typeName}.${methodName || '<anonymous>'} (${fileLocation})`;
        }
      } else if (isConstructor) {
        return `new ${functionName || '<anonymous>'} (${fileLocation})`;
      } else if (functionName) {
        return `${functionName} (${fileLocation})`;
      } else {
        return fileLocation;
      }
    };
    getSourceMapping = function(filename, line, column) {
      var answer, sourceMap;
      sourceMap = getSourceMap(filename, line, column);
      if (sourceMap != null) {
        answer = sourceMap.sourceLocation([line - 1, column - 1]);
      }
      if (answer != null) {
        return [answer[0] + 1, answer[1] + 1];
      } else {
        return null;
      }
    };
    // Based on [michaelficarra/CoffeeScriptRedux](http://goo.gl/ZTx1p)
    // NodeJS / V8 have no support for transforming positions in stack traces using
    // sourceMap, so we must monkey-patch Error to display CoffeeScript source
    // positions.
    return Error.prepareStackTrace = function(err, stack) {
      var frame, frames;
      frames = (function() {
        var i, len, results;
        results = [];
        for (i = 0, len = stack.length; i < len; i++) {
          frame = stack[i];
          if (frame.getFunction() === exports.run) {
            // Don’t display stack frames deeper than `CoffeeScript.run`.
            break;
          }
          results.push(`    at ${formatSourcePosition(frame, getSourceMapping)}`);
        }
        return results;
      })();
      return `${err.toString()}\n${frames.join('\n')}\n`;
    };
  };

  checkShebangLine = function(file, input) {
    var args, firstLine, ref, rest;
    firstLine = input.split(/$/m, 1)[0];
    rest = firstLine != null ? firstLine.match(/^#!\s*([^\s]+\s*)(.*)/) : void 0;
    args = rest != null ? (ref = rest[2]) != null ? ref.split(/\s/).filter(function(s) {
      return s !== '';
    }) : void 0 : void 0;
    if ((args != null ? args.length : void 0) > 1) {
      console.error(`The script to be run begins with a shebang line with more than one
argument. This script will fail on platforms such as Linux which only
allow a single argument.`);
      console.error(`The shebang line was: '${firstLine}' in file '${file}'`);
      return console.error(`The arguments were: ${JSON.stringify(args)}`);
    }
  };

}).call(this);

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NvZmZlZXNjcmlwdC5jb2ZmZWUiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR3NDO0VBQUE7Ozs7QUFBQSxNQUFBLGVBQUEsRUFBQSxLQUFBLEVBQUEsU0FBQSxFQUFBLFlBQUEsRUFBQSxnQkFBQSxFQUFBLE9BQUEsRUFBQSxZQUFBLEVBQUEsT0FBQSxFQUFBLEtBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBLGdCQUFBLEVBQUE7O0VBRXRDLENBQUEsQ0FBQyxLQUFELENBQUEsR0FBZ0IsT0FBQSxDQUFRLFNBQVIsQ0FBaEI7O0VBQ0EsQ0FBQSxDQUFDLE1BQUQsQ0FBQSxHQUFnQixPQUFBLENBQVEsVUFBUixDQUFoQjs7RUFDQSxPQUFBLEdBQWdCLE9BQUEsQ0FBUSxXQUFSOztFQUNoQixTQUFBLEdBQWdCLE9BQUEsQ0FBUSxhQUFSLEVBTHNCOzs7O0VBUXRDLFdBQUEsR0FBZ0IsT0FBQSxDQUFRLG9CQUFSLEVBUnNCOzs7RUFXdEMsT0FBTyxDQUFDLE9BQVIsR0FBa0IsV0FBVyxDQUFDOztFQUU5QixPQUFPLENBQUMsZUFBUixHQUEwQixlQUFBLEdBQWtCLENBQUMsU0FBRCxFQUFZLFlBQVosRUFBMEIsWUFBMUIsRUFiTjs7O0VBZ0J0QyxPQUFPLENBQUMsT0FBUixHQUFrQjs7RUFFbEIsQ0FBQSxDQUFDLFlBQUQsRUFBZSxnQkFBZixDQUFBLEdBQW1DLFNBQW5DLEVBbEJzQzs7Ozs7RUFzQnRDLE9BQU8sQ0FBQyxnQkFBUixHQUEyQixpQkF0Qlc7OztFQXlCdEMsWUFBQSxHQUFlLFFBQUEsQ0FBQyxHQUFELENBQUE7QUFBUyxZQUFBLEtBQUE7QUFBQSxXQUNqQixPQUFPLE1BQVAsS0FBaUIsVUFEQTtlQUVwQixNQUFNLENBQUMsSUFBUCxDQUFZLEdBQVosQ0FBZ0IsQ0FBQyxRQUFqQixDQUEwQixRQUExQjtBQUZvQixXQUdqQixPQUFPLElBQVAsS0FBZSxVQUhFOzs7OztlQVFwQixJ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QUFILENBQUEsRUFBQSxDQUFBLENBQXNCLE1BQU0sQ0FBQyxJQUFQLENBQVksSUFBWixDQUF0QixDQUFBLEVBQUE7SUFOd0I7RUFoRUY7O0VBd0UxQixnQkFBQSxHQUFtQixRQUFBLENBQUMsSUFBRCxFQUFPLEtBQVAsQ0FBQTtBQUNuQixRQUFBLElBQUEsRUFBQSxTQUFBLEVBQUEsR0FBQSxFQUFBO0lBQUUsU0FBQSxHQUFZLEtBQUssQ0FBQyxLQUFOLENBQVksSUFBWixFQUFrQixDQUFsQixDQUFvQixDQUFDLENBQUQ7SUFDaEMsSUFBQSx1QkFBTyxTQUFTLENBQUUsS0FBWCxDQUFpQix1QkFBakI7SUFDUCxJQUFBLCtDQUFlLENBQUUsS0FBVixDQUFnQixJQUFoQixDQUFxQixDQUFDLE1BQXRCLENBQTZCLFFBQUEsQ0FBQyxDQUFELENBQUE7YUFBTyxDQUFBLEtBQU87SUFBZCxDQUE3QjtJQUNQLG9CQUFHLElBQUksQ0FBRSxnQkFBTixHQUFlLENBQWxCO01BQ0UsT0FBTyxDQUFDLEtBQVIsQ0FBYyxDQUFBOzt3QkFBQSxDQUFkO01BS0EsT0FBTyxDQUFDLEtBQVIsQ0FBYyxDQUFBLHVCQUFBLENBQUEsQ0FBMEIsU0FBMUIsQ0FBQSxXQUFBLENBQUEsQ0FBaUQsSUFBakQsQ0FBQSxDQUFBLENBQWQ7YUFDQSxPQUFPLENBQUMsS0FBUixDQUFjLENBQUEsb0JBQUEsQ0FBQSxDQUF1QixJQUFJLENBQUMsU0FBTCxDQUFlLElBQWYsQ0FBdkIsQ0FBQSxDQUFkLEVBUEY7O0VBSmlCO0FBcFVtQiIsInNvdXJjZXNDb250ZW50IjpbIiMgQ29mZmVlU2NyaXB0IGNhbiBiZSB1c2VkIGJvdGggb24gdGhlIHNlcnZlciwgYXMgYSBjb21tYW5kLWxpbmUgY29tcGlsZXIgYmFzZWRcbiMgb24gTm9kZS5qcy9WOCwgb3IgdG8gcnVuIENvZmZlZVNjcmlwdCBkaXJlY3RseSBpbiB0aGUgYnJvd3Nlci4gVGhpcyBtb2R1bGVcbiMgY29udGFpbnMgdGhlIG1haW4gZW50cnkgZnVuY3Rpb25zIGZvciB0b2tlbml6aW5nLCBwYXJzaW5nLCBhbmQgY29tcGlsaW5nXG4jIHNvdXJjZSBDb2ZmZWVTY3JpcHQgaW50byBKYXZhU2NyaXB0LlxuXG57TGV4ZXJ9ICAgICAgID0gcmVxdWlyZSAnLi9sZXhlcidcbntwYXJzZXJ9ICAgICAgPSByZXF1aXJlICcuL3BhcnNlcidcbmhlbHBlcnMgICAgICAgPSByZXF1aXJlICcuL2hlbHBlcnMnXG5Tb3VyY2VNYXAgICAgID0gcmVxdWlyZSAnLi9zb3VyY2VtYXAnXG4jIFJlcXVpcmUgYHBhY2thZ2UuanNvbmAsIHdoaWNoIGlzIHR3byBsZXZlbHMgYWJvdmUgdGhpcyBmaWxlLCBhcyB0aGlzIGZpbGUgaXNcbiMgZXZhbHVhdGVkIGZyb20gYGxpYi9jb2ZmZWVzY3JpcHRgLlxucGFja2FnZUpzb24gICA9IHJlcXVpcmUgJy4uLy4uL3BhY2thZ2UuanNvbidcblxuIyBUaGUgY3VycmVudCBDb2ZmZWVTY3JpcHQgdmVyc2lvbiBudW1iZXIuXG5leHBvcnRzLlZFUlNJT04gPSBwYWNrYWdlSnNvbi52ZXJzaW9uXG5cbmV4cG9ydHMuRklMRV9FWFRFTlNJT05TID0gRklMRV9FWFRFTlNJT05TID0gWycuY29mZmVlJywgJy5saXRjb2ZmZWUnLCAnLmNvZmZlZS5tZCddXG5cbiMgRXhwb3NlIGhlbHBlcnMgZm9yIHRlc3RpbmcuXG5leHBvcnRzLmhlbHBlcnMgPSBoZWxwZXJzXG5cbntnZXRTb3VyY2VNYXAsIHJlZ2lzdGVyQ29tcGlsZWR9ID0gU291cmNlTWFwXG4jIFRoaXMgaXMgZXhwb3J0ZWQgdG8gZW5hYmxlIGFuIGV4dGVybmFsIG1vZHVsZSB0byBpbXBsZW1lbnQgY2FjaGluZyBvZlxuIyBzb3VyY2VtYXBzLiBUaGlzIGlzIHVzZWQgb25seSB3aGVuIGBwYXRjaFN0YWNrVHJhY2VgIGhhcyBiZWVuIGNhbGxlZCB0byBhZGp1c3RcbiMgc3RhY2sgdHJhY2VzIGZvciBmaWxlcyB3aXRoIGNhY2hlZCBzb3VyY2UgbWFwcy5cbmV4cG9ydHMucmVnaXN0ZXJDb21waWxlZCA9IHJlZ2lzdGVyQ29tcGlsZWRcblxuIyBGdW5jdGlvbiB0aGF0IGFsbG93cyBmb3IgYnRvYSBpbiBib3RoIG5vZGVqcyBhbmQgdGhlIGJyb3dzZXIuXG5iYXNlNjRlbmNvZGUgPSAoc3JjKSAtPiBzd2l0Y2hcbiAgd2hlbiB0eXBlb2YgQnVmZmVyIGlzICdmdW5jdGlvbidcbiAgICBCdWZmZXIuZnJvbShzcmMpLnRvU3RyaW5nKCdiYXNlNjQnKVxuICB3aGVuIHR5cGVvZiBidG9hIGlzICdmdW5jdGlvbidcbiAgICAjIFRoZSBjb250ZW50cyBvZiBhIGA8c2NyaXB0PmAgYmxvY2sgYXJlIGVuY29kZWQgdmlhIFVURi0xNiwgc28gaWYgYW55IGV4dGVuZGVkXG4gICAgIyBjaGFyYWN0ZXJzIGFyZSB1c2VkIGluIHRoZSBibG9jaywgYnRvYSB3aWxsIGZhaWwgYXMgaXQgbWF4ZXMgb3V0IGF0IFVURi04LlxuICAgICMgU2VlIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9XaW5kb3dCYXNlNjQvQmFzZTY0X2VuY29kaW5nX2FuZF9kZWNvZGluZyNUaGVfVW5pY29kZV9Qcm9ibGVtXG4gICAgIyBmb3IgdGhlIGdvcnkgZGV0YWlscywgYW5kIGZvciB0aGUgc29sdXRpb24gaW1wbGVtZW50ZWQgaGVyZS5cbiAgICBidG9hIGVuY29kZVVSSUNvbXBvbmVudChzcmMpLnJlcGxhY2UgLyUoWzAtOUEtRl17Mn0pL2csIChtYXRjaCwgcDEpIC0+XG4gICAgICBTdHJpbmcuZnJvbUNoYXJDb2RlICcweCcgKyBwMVxuICBlbHNlXG4gICAgdGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gYmFzZTY0IGVuY29kZSBpbmxpbmUgc291cmNlbWFwLicpXG5cbiMgRnVuY3Rpb24gd3JhcHBlciB0byBhZGQgc291cmNlIGZpbGUgaW5mb3JtYXRpb24gdG8gU3ludGF4RXJyb3JzIHRocm93biBieSB0aGVcbiMgbGV4ZXIvcGFyc2VyL2NvbXBpbGVyLlxud2l0aFByZXR0eUVycm9ycyA9IChmbikgLT5cbiAgKGNvZGUsIG9wdGlvbnMgPSB7fSwgaGFuZGxlciA9IG51bGwgKSAtPlxuICAgIHRyeVxuICAgICAgZm4uY2FsbCBALCBjb2RlLCBvcHRpb25zLCBoYW5kbGVyXG4gICAgY2F0Y2ggZXJyXG4gICAgICB0aHJvdyBlcnIgaWYgdHlwZW9mIGNvZGUgaXNudCAnc3RyaW5nJyAjIFN1cHBvcnQgYENvZmZlZVNjcmlwdC5ub2Rlcyh0b2tlbnMpYC5cbiAgICAgIHRocm93IGhlbHBlcnMudXBkYXRlU3ludGF4RXJyb3IgZXJyLCBjb2RlLCBvcHRpb25zLmZpbGVuYW1lXG5cbiMgQ29tcGlsZSBDb2ZmZWVTY3JpcHQgY29kZSB0byBKYXZhU2NyaXB0LCB1c2luZyB0aGUgQ29mZmVlL0ppc29uIGNvbXBpbGVyLlxuI1xuIyBJZiBgb3B0aW9ucy5zb3VyY2VNYXBgIGlzIHNwZWNpZmllZCwgdGhlbiBgb3B0aW9ucy5maWxlbmFtZWAgbXVzdCBhbHNvIGJlXG4jIHNwZWNpZmllZC4gQWxsIG9wdGlvbnMgdGhhdCBjYW4gYmUgcGFzc2VkIHRvIGBTb3VyY2VNYXAjZ2VuZXJhdGVgIG1heSBhbHNvXG4jIGJlIHBhc3NlZCBoZXJlLlxuI1xuIyBUaGlzIHJldHVybnMgYSBqYXZhc2NyaXB0IHN0cmluZywgdW5sZXNzIGBvcHRpb25zLnNvdXJjZU1hcGAgaXMgcGFzc2VkLFxuIyBpbiB3aGljaCBjYXNlIHRoaXMgcmV0dXJucyBhIGB7anMsIHYzU291cmNlTWFwLCBzb3VyY2VNYXB9YFxuIyBvYmplY3QsIHdoZXJlIHNvdXJjZU1hcCBpcyBhIHNvdXJjZW1hcC5jb2ZmZWUjU291cmNlTWFwIG9iamVjdCwgaGFuZHkgZm9yXG4jIGRvaW5nIHByb2dyYW1tYXRpYyBsb29rdXBzLlxuZXhwb3J0cy5jb21waWxlID0gY29tcGlsZSA9IHdpdGhQcmV0dHlFcnJvcnMgKGNvZGUsIG9wdGlvbnMgPSB7fSwgaGFuZGxlciA9IG51bGwpIC0+ICMgISEhISEhISEhIVxuIyBleHBvcnRzLmNvbXBpbGUgPSBjb21waWxlID0gd2l0aFByZXR0eUVycm9ycyAoY29kZSwgb3B0aW9ucyA9IHt9KSAtPlxuICAjIGNvbnNvbGUubG9nICfOqUNTX19fMScsIFwiY29tcGlsZSgpXCIsIGhhbmRsZXIgIyAhISEhISEhISEhISEhISEhISFcbiAgIyBDbG9uZSBgb3B0aW9uc2AsIHRvIGF2b2lkIG11dGF0aW5nIHRoZSBgb3B0aW9uc2Agb2JqZWN0IHBhc3NlZCBpbi5cbiAgb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24ge30sIG9wdGlvbnNcblxuICBnZW5lcmF0ZVNvdXJjZU1hcCA9IG9wdGlvbnMuc291cmNlTWFwIG9yIG9wdGlvbnMuaW5saW5lTWFwIG9yIG5vdCBvcHRpb25zLmZpbGVuYW1lP1xuICBmaWxlbmFtZSA9IG9wdGlvbnMuZmlsZW5hbWUgb3IgaGVscGVycy5hbm9ueW1vdXNGaWxlTmFtZSgpXG5cbiAgY2hlY2tTaGViYW5nTGluZSBmaWxlbmFtZSwgY29kZVxuXG4gIG1hcCA9IG5ldyBTb3VyY2VNYXAgaWYgZ2VuZXJhdGVTb3VyY2VNYXBcblxuICB0b2tlbnMgPSBsZXhlci50b2tlbml6ZSBjb2RlLCBvcHRpb25zXG4gIGhhbmRsZXIgeyB0b2tlbnMsIH0gaWYgaGFuZGxlcj9cblxuICAjIFBhc3MgYSBsaXN0IG9mIHJlZmVyZW5jZWQgdmFyaWFibGVzLCBzbyB0aGF0IGdlbmVyYXRlZCB2YXJpYWJsZXMgd29u4oCZdCBnZXRcbiAgIyB0aGUgc2FtZSBuYW1lLlxuICBvcHRpb25zLnJlZmVyZW5jZWRWYXJzID0gKFxuICAgIHRva2VuWzFdIGZvciB0b2tlbiBpbiB0b2tlbnMgd2hlbiB0b2tlblswXSBpcyAnSURFTlRJRklFUidcbiAgKVxuXG4gICMgQ2hlY2sgZm9yIGltcG9ydCBvciBleHBvcnQ7IGlmIGZvdW5kLCBmb3JjZSBiYXJlIG1vZGUuXG4gIHVubGVzcyBvcHRpb25zLmJhcmU/IGFuZCBvcHRpb25zLmJhcmUgaXMgeWVzXG4gICAgZm9yIHRva2VuIGluIHRva2Vuc1xuICAgICAgaWYgdG9rZW5bMF0gaW4gWydJTVBPUlQnLCAnRVhQT1JUJ11cbiAgICAgICAgb3B0aW9ucy5iYXJlID0geWVzXG4gICAgICAgIGJyZWFrXG5cbiAgbm9kZXMgPSBwYXJzZXIucGFyc2UgdG9rZW5zXG4gICMgSWYgYWxsIHRoYXQgd2FzIHJlcXVlc3RlZCB3YXMgYSBQT0pPIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBub2RlcywgZS5nLlxuICAjIHRoZSBhYnN0cmFjdCBzeW50YXggdHJlZSAoQVNUKSwgd2UgY2FuIHN0b3Agbm93IGFuZCBqdXN0IHJldHVybiB0aGF0XG4gICMgKGFmdGVyIGZpeGluZyB0aGUgbG9jYXRpb24gZGF0YSBmb3IgdGhlIHJvb3QvYEZpbGVgwrtgUHJvZ3JhbWAgbm9kZSxcbiAgIyB3aGljaCBtaWdodOKAmXZlIGdvdHRlbiBtaXNhbGlnbmVkIGZyb20gdGhlIG9yaWdpbmFsIHNvdXJjZSBkdWUgdG8gdGhlXG4gICMgYGNsZWFuYCBmdW5jdGlvbiBpbiB0aGUgbGV4ZXIpLlxuICBpZiBvcHRpb25zLmFzdFxuICAgIG5vZGVzLmFsbENvbW1lbnRUb2tlbnMgPSBoZWxwZXJzLmV4dHJhY3RBbGxDb21tZW50VG9rZW5zIHRva2Vuc1xuICAgIHNvdXJjZUNvZGVOdW1iZXJPZkxpbmVzID0gKGNvZGUubWF0Y2goL1xccj9cXG4vZykgb3IgJycpLmxlbmd0aCArIDFcbiAgICBzb3VyY2VDb2RlTGFzdExpbmUgPSAvLiokLy5leGVjKGNvZGUpWzBdICMgYC4qYCBtYXRjaGVzIGFsbCBidXQgbGluZSBicmVhayBjaGFyYWN0ZXJzLlxuICAgIGFzdCA9IG5vZGVzLmFzdCBvcHRpb25zXG4gICAgcmFuZ2UgPSBbMCwgY29kZS5sZW5ndGhdXG4gICAgYXN0LnN0YXJ0ID0gYXN0LnByb2dyYW0uc3RhcnQgPSByYW5nZVswXVxuICAgIGFzdC5lbmQgPSBhc3QucHJvZ3JhbS5lbmQgPSByYW5nZVsxXVxuICAgIGFzdC5yYW5nZSA9IGFzdC5wcm9ncmFtLnJhbmdlID0gcmFuZ2VcbiAgICBhc3QubG9jLnN0YXJ0ID0gYXN0LnByb2dyYW0ubG9jLnN0YXJ0ID0ge2xpbmU6IDEsIGNvbHVtbjogMH1cbiAgICBhc3QubG9jLmVuZC5saW5lID0gYXN0LnByb2dyYW0ubG9jLmVuZC5saW5lID0gc291cmNlQ29kZU51bWJlck9mTGluZXNcbiAgICBhc3QubG9jLmVuZC5jb2x1bW4gPSBhc3QucHJvZ3JhbS5sb2MuZW5kLmNvbHVtbiA9IHNvdXJjZUNvZGVMYXN0TGluZS5sZW5ndGhcbiAgICBhc3QudG9rZW5zID0gdG9rZW5zXG4gICAgcmV0dXJuIGFzdFxuXG4gIGZyYWdtZW50cyA9IG5vZGVzLmNvbXBpbGVUb0ZyYWdtZW50cyBvcHRpb25zXG5cbiAgY3VycmVudExpbmUgPSAwXG4gIGN1cnJlbnRMaW5lICs9IDEgaWYgb3B0aW9ucy5oZWFkZXJcbiAgY3VycmVudExpbmUgKz0gMSBpZiBvcHRpb25zLnNoaWZ0TGluZVxuICBjdXJyZW50Q29sdW1uID0gMFxuICBqcyA9IFwiXCJcbiAgZm9yIGZyYWdtZW50IGluIGZyYWdtZW50c1xuICAgICMgVXBkYXRlIHRoZSBzb3VyY2VtYXAgd2l0aCBkYXRhIGZyb20gZWFjaCBmcmFnbWVudC5cbiAgICBpZiBnZW5lcmF0ZVNvdXJjZU1hcFxuICAgICAgIyBEbyBub3QgaW5jbHVkZSBlbXB0eSwgd2hpdGVzcGFjZSwgb3Igc2VtaWNvbG9uLW9ubHkgZnJhZ21lbnRzLlxuICAgICAgaWYgZnJhZ21lbnQubG9jYXRpb25EYXRhIGFuZCBub3QgL15bO1xcc10qJC8udGVzdCBmcmFnbWVudC5jb2RlXG4gICAgICAgIG1hcC5hZGQoXG4gICAgICAgICAgW2ZyYWdtZW50LmxvY2F0aW9uRGF0YS5maXJzdF9saW5lLCBmcmFnbWVudC5sb2NhdGlvbkRhdGEuZmlyc3RfY29sdW1uXVxuICAgICAgICAgIFtjdXJyZW50TGluZSwgY3VycmVudENvbHVtbl1cbiAgICAgICAgICB7bm9SZXBsYWNlOiB0cnVlfSlcbiAgICAgIG5ld0xpbmVzID0gaGVscGVycy5jb3VudCBmcmFnbWVudC5jb2RlLCBcIlxcblwiXG4gICAgICBjdXJyZW50TGluZSArPSBuZXdMaW5lc1xuICAgICAgaWYgbmV3TGluZXNcbiAgICAgICAgY3VycmVudENvbHVtbiA9IGZyYWdtZW50LmNvZGUubGVuZ3RoIC0gKGZyYWdtZW50LmNvZGUubGFzdEluZGV4T2YoXCJcXG5cIikgKyAxKVxuICAgICAgZWxzZVxuICAgICAgICBjdXJyZW50Q29sdW1uICs9IGZyYWdtZW50LmNvZGUubGVuZ3RoXG5cbiAgICAjIENvcHkgdGhlIGNvZGUgZnJvbSBlYWNoIGZyYWdtZW50IGludG8gdGhlIGZpbmFsIEphdmFTY3JpcHQuXG4gICAganMgKz0gZnJhZ21lbnQuY29kZVxuXG4gIGlmIG9wdGlvbnMuaGVhZGVyXG4gICAgaGVhZGVyID0gXCJHZW5lcmF0ZWQgYnkgQ29mZmVlU2NyaXB0ICN7QFZFUlNJT059XCJcbiAgICBqcyA9IFwiLy8gI3toZWFkZXJ9XFxuI3tqc31cIlxuXG4gIGlmIGdlbmVyYXRlU291cmNlTWFwXG4gICAgdjNTb3VyY2VNYXAgPSBtYXAuZ2VuZXJhdGUgb3B0aW9ucywgY29kZVxuXG4gIGlmIG9wdGlvbnMudHJhbnNwaWxlXG4gICAgaWYgdHlwZW9mIG9wdGlvbnMudHJhbnNwaWxlIGlzbnQgJ29iamVjdCdcbiAgICAgICMgVGhpcyBvbmx5IGhhcHBlbnMgaWYgcnVuIHZpYSB0aGUgTm9kZSBBUEkgYW5kIGB0cmFuc3BpbGVgIGlzIHNldCB0b1xuICAgICAgIyBzb21ldGhpbmcgb3RoZXIgdGhhbiBhbiBvYmplY3QuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IgJ1RoZSB0cmFuc3BpbGUgb3B0aW9uIG11c3QgYmUgZ2l2ZW4gYW4gb2JqZWN0IHdpdGggb3B0aW9ucyB0byBwYXNzIHRvIEJhYmVsJ1xuXG4gICAgIyBHZXQgdGhlIHJlZmVyZW5jZSB0byBCYWJlbCB0aGF0IHdlIGhhdmUgYmVlbiBwYXNzZWQgaWYgdGhpcyBjb21waWxlclxuICAgICMgaXMgcnVuIHZpYSB0aGUgQ0xJIG9yIE5vZGUgQVBJLlxuICAgIHRyYW5zcGlsZXIgPSBvcHRpb25zLnRyYW5zcGlsZS50cmFuc3BpbGVcbiAgICBkZWxldGUgb3B0aW9ucy50cmFuc3BpbGUudHJhbnNwaWxlXG5cbiAgICB0cmFuc3BpbGVyT3B0aW9ucyA9IE9iamVjdC5hc3NpZ24ge30sIG9wdGlvbnMudHJhbnNwaWxlXG5cbiAgICAjIFNlZSBodHRwczovL2dpdGh1Yi5jb20vYmFiZWwvYmFiZWwvaXNzdWVzLzgyNyNpc3N1ZWNvbW1lbnQtNzc1NzMxMDc6XG4gICAgIyBCYWJlbCBjYW4gdGFrZSBhIHYzIHNvdXJjZSBtYXAgb2JqZWN0IGFzIGlucHV0IGluIGBpbnB1dFNvdXJjZU1hcGBcbiAgICAjIGFuZCBpdCB3aWxsIHJldHVybiBhbiAqdXBkYXRlZCogdjMgc291cmNlIG1hcCBvYmplY3QgaW4gaXRzIG91dHB1dC5cbiAgICBpZiB2M1NvdXJjZU1hcCBhbmQgbm90IHRyYW5zcGlsZXJPcHRpb25zLmlucHV0U291cmNlTWFwP1xuICAgICAgdHJhbnNwaWxlck9wdGlvbnMuaW5wdXRTb3VyY2VNYXAgPSB2M1NvdXJjZU1hcFxuICAgIHRyYW5zcGlsZXJPdXRwdXQgPSB0cmFuc3BpbGVyIGpzLCB0cmFuc3BpbGVyT3B0aW9uc1xuICAgIGpzID0gdHJhbnNwaWxlck91dHB1dC5jb2RlXG4gICAgaWYgdjNTb3VyY2VNYXAgYW5kIHRyYW5zcGlsZXJPdXRwdXQubWFwXG4gICAgICB2M1NvdXJjZU1hcCA9IHRyYW5zcGlsZXJPdXRwdXQubWFwXG5cbiAgaWYgb3B0aW9ucy5pbmxpbmVNYXBcbiAgICBlbmNvZGVkID0gYmFzZTY0ZW5jb2RlIEpTT04uc3RyaW5naWZ5IHYzU291cmNlTWFwXG4gICAgc291cmNlTWFwRGF0YVVSSSA9IFwiLy8jIHNvdXJjZU1hcHBpbmdVUkw9ZGF0YTphcHBsaWNhdGlvbi9qc29uO2Jhc2U2NCwje2VuY29kZWR9XCJcbiAgICBzb3VyY2VVUkwgPSBcIi8vIyBzb3VyY2VVUkw9I3tmaWxlbmFtZX1cIlxuICAgIGpzID0gXCIje2pzfVxcbiN7c291cmNlTWFwRGF0YVVSSX1cXG4je3NvdXJjZVVSTH1cIlxuXG4gIHJlZ2lzdGVyQ29tcGlsZWQgZmlsZW5hbWUsIGNvZGUsIG1hcFxuXG4gIGlmIG9wdGlvbnMuc291cmNlTWFwXG4gICAge1xuICAgICAganNcbiAgICAgIHNvdXJjZU1hcDogbWFwXG4gICAgICB2M1NvdXJjZU1hcDogSlNPTi5zdHJpbmdpZnkgdjNTb3VyY2VNYXAsIG51bGwsIDJcbiAgICB9XG4gIGVsc2VcbiAgICBqc1xuXG4jIFRva2VuaXplIGEgc3RyaW5nIG9mIENvZmZlZVNjcmlwdCBjb2RlLCBhbmQgcmV0dXJuIHRoZSBhcnJheSBvZiB0b2tlbnMuXG5leHBvcnRzLnRva2VucyA9IHdpdGhQcmV0dHlFcnJvcnMgKGNvZGUsIG9wdGlvbnMpIC0+XG4gIGxleGVyLnRva2VuaXplIGNvZGUsIG9wdGlvbnNcblxuIyBQYXJzZSBhIHN0cmluZyBvZiBDb2ZmZWVTY3JpcHQgY29kZSBvciBhbiBhcnJheSBvZiBsZXhlZCB0b2tlbnMsIGFuZFxuIyByZXR1cm4gdGhlIEFTVC4gWW91IGNhbiB0aGVuIGNvbXBpbGUgaXQgYnkgY2FsbGluZyBgLmNvbXBpbGUoKWAgb24gdGhlIHJvb3QsXG4jIG9yIHRyYXZlcnNlIGl0IGJ5IHVzaW5nIGAudHJhdmVyc2VDaGlsZHJlbigpYCB3aXRoIGEgY2FsbGJhY2suXG5leHBvcnRzLm5vZGVzID0gd2l0aFByZXR0eUVycm9ycyAoc291cmNlLCBvcHRpb25zKSAtPlxuICBzb3VyY2UgPSBsZXhlci50b2tlbml6ZSBzb3VyY2UsIG9wdGlvbnMgaWYgdHlwZW9mIHNvdXJjZSBpcyAnc3RyaW5nJ1xuICBwYXJzZXIucGFyc2Ugc291cmNlXG5cbiMgVGhpcyBmaWxlIHVzZWQgdG8gZXhwb3J0IHRoZXNlIG1ldGhvZHM7IGxlYXZlIHN0dWJzIHRoYXQgdGhyb3cgd2FybmluZ3NcbiMgaW5zdGVhZC4gVGhlc2UgbWV0aG9kcyBoYXZlIGJlZW4gbW92ZWQgaW50byBgaW5kZXguY29mZmVlYCB0byBwcm92aWRlXG4jIHNlcGFyYXRlIGVudHJ5cG9pbnRzIGZvciBOb2RlIGFuZCBub24tTm9kZSBlbnZpcm9ubWVudHMsIHNvIHRoYXQgc3RhdGljXG4jIGFuYWx5c2lzIHRvb2xzIGRvbuKAmXQgY2hva2Ugb24gTm9kZSBwYWNrYWdlcyB3aGVuIGNvbXBpbGluZyBmb3IgYSBub24tTm9kZVxuIyBlbnZpcm9ubWVudC5cbmV4cG9ydHMucnVuID0gZXhwb3J0cy5ldmFsID0gZXhwb3J0cy5yZWdpc3RlciA9IC0+XG4gIHRocm93IG5ldyBFcnJvciAncmVxdWlyZSBpbmRleC5jb2ZmZWUsIG5vdCB0aGlzIGZpbGUnXG5cbiMgSW5zdGFudGlhdGUgYSBMZXhlciBmb3Igb3VyIHVzZSBoZXJlLlxubGV4ZXIgPSBuZXcgTGV4ZXJcblxuIyBUaGUgcmVhbCBMZXhlciBwcm9kdWNlcyBhIGdlbmVyaWMgc3RyZWFtIG9mIHRva2Vucy4gVGhpcyBvYmplY3QgcHJvdmlkZXMgYVxuIyB0aGluIHdyYXBwZXIgYXJvdW5kIGl0LCBjb21wYXRpYmxlIHdpdGggdGhlIEppc29uIEFQSS4gV2UgY2FuIHRoZW4gcGFzcyBpdFxuIyBkaXJlY3RseSBhcyBhIOKAnEppc29uIGxleGVyLuKAnVxucGFyc2VyLmxleGVyID1cbiAgeXlsbG9jOlxuICAgIHJhbmdlOiBbXVxuICBvcHRpb25zOlxuICAgIHJhbmdlczogeWVzXG4gIGxleDogLT5cbiAgICB0b2tlbiA9IHBhcnNlci50b2tlbnNbQHBvcysrXVxuICAgIGlmIHRva2VuXG4gICAgICBbdGFnLCBAeXl0ZXh0LCBAeXlsbG9jXSA9IHRva2VuXG4gICAgICBwYXJzZXIuZXJyb3JUb2tlbiA9IHRva2VuLm9yaWdpbiBvciB0b2tlblxuICAgICAgQHl5bGluZW5vID0gQHl5bGxvYy5maXJzdF9saW5lXG4gICAgZWxzZVxuICAgICAgdGFnID0gJydcbiAgICB0YWdcbiAgc2V0SW5wdXQ6ICh0b2tlbnMpIC0+XG4gICAgcGFyc2VyLnRva2VucyA9IHRva2Vuc1xuICAgIEBwb3MgPSAwXG4gIHVwY29taW5nSW5wdXQ6IC0+ICcnXG5cbiMgTWFrZSBhbGwgdGhlIEFTVCBub2RlcyB2aXNpYmxlIHRvIHRoZSBwYXJzZXIuXG5wYXJzZXIueXkgPSByZXF1aXJlICcuL25vZGVzJ1xuXG4jIE92ZXJyaWRlIEppc29uJ3MgZGVmYXVsdCBlcnJvciBoYW5kbGluZyBmdW5jdGlvbi5cbnBhcnNlci55eS5wYXJzZUVycm9yID0gKG1lc3NhZ2UsIHt0b2tlbn0pIC0+XG4gICMgRGlzcmVnYXJkIEppc29uJ3MgbWVzc2FnZSwgaXQgY29udGFpbnMgcmVkdW5kYW50IGxpbmUgbnVtYmVyIGluZm9ybWF0aW9uLlxuICAjIERpc3JlZ2FyZCB0aGUgdG9rZW4sIHdlIHRha2UgaXRzIHZhbHVlIGRpcmVjdGx5IGZyb20gdGhlIGxleGVyIGluIGNhc2VcbiAgIyB0aGUgZXJyb3IgaXMgY2F1c2VkIGJ5IGEgZ2VuZXJhdGVkIHRva2VuIHdoaWNoIG1pZ2h0IHJlZmVyIHRvIGl0cyBvcmlnaW4uXG4gIHtlcnJvclRva2VuLCB0b2tlbnN9ID0gcGFyc2VyXG4gIFtlcnJvclRhZywgZXJyb3JUZXh0LCBlcnJvckxvY10gPSBlcnJvclRva2VuXG5cbiAgZXJyb3JUZXh0ID0gc3dpdGNoXG4gICAgd2hlbiBlcnJvclRva2VuIGlzIHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV1cbiAgICAgICdlbmQgb2YgaW5wdXQnXG4gICAgd2hlbiBlcnJvclRhZyBpbiBbJ0lOREVOVCcsICdPVVRERU5UJ11cbiAgICAgICdpbmRlbnRhdGlvbidcbiAgICB3aGVuIGVycm9yVGFnIGluIFsnSURFTlRJRklFUicsICdOVU1CRVInLCAnSU5GSU5JVFknLCAnU1RSSU5HJywgJ1NUUklOR19TVEFSVCcsICdSRUdFWCcsICdSRUdFWF9TVEFSVCddXG4gICAgICBlcnJvclRhZy5yZXBsYWNlKC9fU1RBUlQkLywgJycpLnRvTG93ZXJDYXNlKClcbiAgICBlbHNlXG4gICAgICBoZWxwZXJzLm5hbWVXaGl0ZXNwYWNlQ2hhcmFjdGVyIGVycm9yVGV4dFxuXG4gICMgVGhlIHNlY29uZCBhcmd1bWVudCBoYXMgYSBgbG9jYCBwcm9wZXJ0eSwgd2hpY2ggc2hvdWxkIGhhdmUgdGhlIGxvY2F0aW9uXG4gICMgZGF0YSBmb3IgdGhpcyB0b2tlbi4gVW5mb3J0dW5hdGVseSwgSmlzb24gc2VlbXMgdG8gc2VuZCBhbiBvdXRkYXRlZCBgbG9jYFxuICAjIChmcm9tIHRoZSBwcmV2aW91cyB0b2tlbiksIHNvIHdlIHRha2UgdGhlIGxvY2F0aW9uIGluZm9ybWF0aW9uIGRpcmVjdGx5XG4gICMgZnJvbSB0aGUgbGV4ZXIuXG4gIGhlbHBlcnMudGhyb3dTeW50YXhFcnJvciBcInVuZXhwZWN0ZWQgI3tlcnJvclRleHR9XCIsIGVycm9yTG9jXG5cbmV4cG9ydHMucGF0Y2hTdGFja1RyYWNlID0gLT5cbiAgIyBCYXNlZCBvbiBodHRwOi8vdjguZ29vZ2xlY29kZS5jb20vc3ZuL2JyYW5jaGVzL2JsZWVkaW5nX2VkZ2Uvc3JjL21lc3NhZ2VzLmpzXG4gICMgTW9kaWZpZWQgdG8gaGFuZGxlIHNvdXJjZU1hcFxuICBmb3JtYXRTb3VyY2VQb3NpdGlvbiA9IChmcmFtZSwgZ2V0U291cmNlTWFwcGluZykgLT5cbiAgICBmaWxlbmFtZSA9IHVuZGVmaW5lZFxuICAgIGZpbGVMb2NhdGlvbiA9ICcnXG5cbiAgICBpZiBmcmFtZS5pc05hdGl2ZSgpXG4gICAgICBmaWxlTG9jYXRpb24gPSBcIm5hdGl2ZVwiXG4gICAgZWxzZVxuICAgICAgaWYgZnJhbWUuaXNFdmFsKClcbiAgICAgICAgZmlsZW5hbWUgPSBmcmFtZS5nZXRTY3JpcHROYW1lT3JTb3VyY2VVUkwoKVxuICAgICAgICBmaWxlTG9jYXRpb24gPSBcIiN7ZnJhbWUuZ2V0RXZhbE9yaWdpbigpfSwgXCIgdW5sZXNzIGZpbGVuYW1lXG4gICAgICBlbHNlXG4gICAgICAgIGZpbGVuYW1lID0gZnJhbWUuZ2V0RmlsZU5hbWUoKVxuXG4gICAgICBmaWxlbmFtZSBvcj0gXCI8YW5vbnltb3VzPlwiXG5cbiAgICAgIGxpbmUgPSBmcmFtZS5nZXRMaW5lTnVtYmVyKClcbiAgICAgIGNvbHVtbiA9IGZyYW1lLmdldENvbHVtbk51bWJlcigpXG5cbiAgICAgICMgQ2hlY2sgZm9yIGEgc291cmNlTWFwIHBvc2l0aW9uXG4gICAgICBzb3VyY2UgPSBnZXRTb3VyY2VNYXBwaW5nIGZpbGVuYW1lLCBsaW5lLCBjb2x1bW5cbiAgICAgIGZpbGVMb2NhdGlvbiA9XG4gICAgICAgIGlmIHNvdXJjZVxuICAgICAgICAgIFwiI3tmaWxlbmFtZX06I3tzb3VyY2VbMF19OiN7c291cmNlWzFdfVwiXG4gICAgICAgIGVsc2VcbiAgICAgICAgICBcIiN7ZmlsZW5hbWV9OiN7bGluZX06I3tjb2x1bW59XCJcblxuICAgIGZ1bmN0aW9uTmFtZSA9IGZyYW1lLmdldEZ1bmN0aW9uTmFtZSgpXG4gICAgaXNDb25zdHJ1Y3RvciA9IGZyYW1lLmlzQ29uc3RydWN0b3IoKVxuICAgIGlzTWV0aG9kQ2FsbCA9IG5vdCAoZnJhbWUuaXNUb3BsZXZlbCgpIG9yIGlzQ29uc3RydWN0b3IpXG5cbiAgICBpZiBpc01ldGhvZENhbGxcbiAgICAgIG1ldGhvZE5hbWUgPSBmcmFtZS5nZXRNZXRob2ROYW1lKClcbiAgICAgIHR5cGVOYW1lID0gZnJhbWUuZ2V0VHlwZU5hbWUoKVxuXG4gICAgICBpZiBmdW5jdGlvbk5hbWVcbiAgICAgICAgdHAgPSBhcyA9ICcnXG4gICAgICAgIGlmIHR5cGVOYW1lIGFuZCBmdW5jdGlvbk5hbWUuaW5kZXhPZiB0eXBlTmFtZVxuICAgICAgICAgIHRwID0gXCIje3R5cGVOYW1lfS5cIlxuICAgICAgICBpZiBtZXRob2ROYW1lIGFuZCBmdW5jdGlvbk5hbWUuaW5kZXhPZihcIi4je21ldGhvZE5hbWV9XCIpIGlzbnQgZnVuY3Rpb25OYW1lLmxlbmd0aCAtIG1ldGhvZE5hbWUubGVuZ3RoIC0gMVxuICAgICAgICAgIGFzID0gXCIgW2FzICN7bWV0aG9kTmFtZX1dXCJcblxuICAgICAgICBcIiN7dHB9I3tmdW5jdGlvbk5hbWV9I3thc30gKCN7ZmlsZUxvY2F0aW9ufSlcIlxuICAgICAgZWxzZVxuICAgICAgICBcIiN7dHlwZU5hbWV9LiN7bWV0aG9kTmFtZSBvciAnPGFub255bW91cz4nfSAoI3tmaWxlTG9jYXRpb259KVwiXG4gICAgZWxzZSBpZiBpc0NvbnN0cnVjdG9yXG4gICAgICBcIm5ldyAje2Z1bmN0aW9uTmFtZSBvciAnPGFub255bW91cz4nfSAoI3tmaWxlTG9jYXRpb259KVwiXG4gICAgZWxzZSBpZiBmdW5jdGlvbk5hbWVcbiAgICAgIFwiI3tmdW5jdGlvbk5hbWV9ICgje2ZpbGVMb2NhdGlvbn0pXCJcbiAgICBlbHNlXG4gICAgICBmaWxlTG9jYXRpb25cblxuICBnZXRTb3VyY2VNYXBwaW5nID0gKGZpbGVuYW1lLCBsaW5lLCBjb2x1bW4pIC0+XG4gICAgc291cmNlTWFwID0gZ2V0U291cmNlTWFwIGZpbGVuYW1lLCBsaW5lLCBjb2x1bW5cblxuICAgIGFuc3dlciA9IHNvdXJjZU1hcC5zb3VyY2VMb2NhdGlvbiBbbGluZSAtIDEsIGNvbHVtbiAtIDFdIGlmIHNvdXJjZU1hcD9cbiAgICBpZiBhbnN3ZXI/IHRoZW4gW2Fuc3dlclswXSArIDEsIGFuc3dlclsxXSArIDFdIGVsc2UgbnVsbFxuXG4gICMgQmFzZWQgb24gW21pY2hhZWxmaWNhcnJhL0NvZmZlZVNjcmlwdFJlZHV4XShodHRwOi8vZ29vLmdsL1pUeDFwKVxuICAjIE5vZGVKUyAvIFY4IGhhdmUgbm8gc3VwcG9ydCBmb3IgdHJhbnNmb3JtaW5nIHBvc2l0aW9ucyBpbiBzdGFjayB0cmFjZXMgdXNpbmdcbiAgIyBzb3VyY2VNYXAsIHNvIHdlIG11c3QgbW9ua2V5LXBhdGNoIEVycm9yIHRvIGRpc3BsYXkgQ29mZmVlU2NyaXB0IHNvdXJjZVxuICAjIHBvc2l0aW9ucy5cbiAgRXJyb3IucHJlcGFyZVN0YWNrVHJhY2UgPSAoZXJyLCBzdGFjaykgLT5cbiAgICBmcmFtZXMgPSBmb3IgZnJhbWUgaW4gc3RhY2tcbiAgICAgICMgRG9u4oCZdCBkaXNwbGF5IHN0YWNrIGZyYW1lcyBkZWVwZXIgdGhhbiBgQ29mZmVlU2NyaXB0LnJ1bmAuXG4gICAgICBicmVhayBpZiBmcmFtZS5nZXRGdW5jdGlvbigpIGlzIGV4cG9ydHMucnVuXG4gICAgICBcIiAgICBhdCAje2Zvcm1hdFNvdXJjZVBvc2l0aW9uIGZyYW1lLCBnZXRTb3VyY2VNYXBwaW5nfVwiXG5cbiAgICBcIiN7ZXJyLnRvU3RyaW5nKCl9XFxuI3tmcmFtZXMuam9pbiAnXFxuJ31cXG5cIlxuXG5jaGVja1NoZWJhbmdMaW5lID0gKGZpbGUsIGlucHV0KSAtPlxuICBmaXJzdExpbmUgPSBpbnB1dC5zcGxpdCgvJC9tLCAxKVswXVxuICByZXN0ID0gZmlyc3RMaW5lPy5tYXRjaCgvXiMhXFxzKihbXlxcc10rXFxzKikoLiopLylcbiAgYXJncyA9IHJlc3Q/WzJdPy5zcGxpdCgvXFxzLykuZmlsdGVyIChzKSAtPiBzIGlzbnQgJydcbiAgaWYgYXJncz8ubGVuZ3RoID4gMVxuICAgIGNvbnNvbGUuZXJyb3IgJycnXG4gICAgICBUaGUgc2NyaXB0IHRvIGJlIHJ1biBiZWdpbnMgd2l0aCBhIHNoZWJhbmcgbGluZSB3aXRoIG1vcmUgdGhhbiBvbmVcbiAgICAgIGFyZ3VtZW50LiBUaGlzIHNjcmlwdCB3aWxsIGZhaWwgb24gcGxhdGZvcm1zIHN1Y2ggYXMgTGludXggd2hpY2ggb25seVxuICAgICAgYWxsb3cgYSBzaW5nbGUgYXJndW1lbnQuXG4gICAgJycnXG4gICAgY29uc29sZS5lcnJvciBcIlRoZSBzaGViYW5nIGxpbmUgd2FzOiAnI3tmaXJzdExpbmV9JyBpbiBmaWxlICcje2ZpbGV9J1wiXG4gICAgY29uc29sZS5lcnJvciBcIlRoZSBhcmd1bWVudHMgd2VyZTogI3tKU09OLnN0cmluZ2lmeSBhcmdzfVwiXG4iXX0=
//# sourceURL=../src/coffeescript.coffee