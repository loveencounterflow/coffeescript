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
    if (handler != null) {
      handler({nodes});
    }
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NvZmZlZXNjcmlwdC5jb2ZmZWUiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBR3NDO0VBQUE7Ozs7QUFBQSxNQUFBLGVBQUEsRUFBQSxLQUFBLEVBQUEsU0FBQSxFQUFBLFlBQUEsRUFBQSxnQkFBQSxFQUFBLE9BQUEsRUFBQSxZQUFBLEVBQUEsT0FBQSxFQUFBLEtBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBLGdCQUFBLEVBQUE7O0VBRXRDLENBQUEsQ0FBQyxLQUFELENBQUEsR0FBZ0IsT0FBQSxDQUFRLFNBQVIsQ0FBaEI7O0VBQ0EsQ0FBQSxDQUFDLE1BQUQsQ0FBQSxHQUFnQixPQUFBLENBQVEsVUFBUixDQUFoQjs7RUFDQSxPQUFBLEdBQWdCLE9BQUEsQ0FBUSxXQUFSOztFQUNoQixTQUFBLEdBQWdCLE9BQUEsQ0FBUSxhQUFSLEVBTHNCOzs7O0VBUXRDLFdBQUEsR0FBZ0IsT0FBQSxDQUFRLG9CQUFSLEVBUnNCOzs7RUFXdEMsT0FBTyxDQUFDLE9BQVIsR0FBa0IsV0FBVyxDQUFDOztFQUU5QixPQUFPLENBQUMsZUFBUixHQUEwQixlQUFBLEdBQWtCLENBQUMsU0FBRCxFQUFZLFlBQVosRUFBMEIsWUFBMUIsRUFiTjs7O0VBZ0J0QyxPQUFPLENBQUMsT0FBUixHQUFrQjs7RUFFbEIsQ0FBQSxDQUFDLFlBQUQsRUFBZSxnQkFBZixDQUFBLEdBQW1DLFNBQW5DLEVBbEJzQzs7Ozs7RUFzQnRDLE9BQU8sQ0FBQyxnQkFBUixHQUEyQixpQkF0Qlc7OztFQXlCdEMsWUFBQSxHQUFlLFFBQUEsQ0FBQyxHQUFELENBQUE7QUFBUyxZQUFBLEtBQUE7QUFBQSxXQUNqQixPQUFPLE1BQVAsS0FBaUIsVUFEQTtlQUVwQixNQUFNLENBQUMsSUFBUCxDQUFZLEdBQVosQ0FBZ0IsQ0FBQyxRQUFqQixDQUEwQixRQUExQjtBQUZvQixXQUdqQixPQUFPLElBQVAsS0FBZSxVQUhFOzs7OztlQVFwQixJ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QUhPLENBQUE7OzthQUtULENBQUEsQ0FBQSxDQUFHLEdBQUcsQ0FBQyxRQUFKLENBQUEsQ0FBSCxDQUFBLEVBQUEsQ0FBQSxDQUFzQixNQUFNLENBQUMsSUFBUCxDQUFZLElBQVosQ0FBdEIsQ0FBQSxFQUFBO0lBTndCO0VBaEVGOztFQXdFMUIsZ0JBQUEsR0FBbUIsUUFBQSxDQUFDLElBQUQsRUFBTyxLQUFQLENBQUE7QUFDbkIsUUFBQSxJQUFBLEVBQUEsU0FBQSxFQUFBLEdBQUEsRUFBQTtJQUFFLFNBQUEsR0FBWSxLQUFLLENBQUMsS0FBTixDQUFZLElBQVosRUFBa0IsQ0FBbEIsQ0FBb0IsQ0FBQyxDQUFEO0lBQ2hDLElBQUEsdUJBQU8sU0FBUyxDQUFFLEtBQVgsQ0FBaUIsdUJBQWpCO0lBQ1AsSUFBQSwrQ0FBZSxDQUFFLEtBQVYsQ0FBZ0IsSUFBaEIsQ0FBcUIsQ0FBQyxNQUF0QixDQUE2QixRQUFBLENBQUMsQ0FBRCxDQUFBO2FBQU8sQ0FBQSxLQUFPO0lBQWQsQ0FBN0I7SUFDUCxvQkFBRyxJQUFJLENBQUUsZ0JBQU4sR0FBZSxDQUFsQjtNQUNFLE9BQU8sQ0FBQyxLQUFSLENBQWMsQ0FBQTs7d0JBQUEsQ0FBZDtNQUtBLE9BQU8sQ0FBQyxLQUFSLENBQWMsQ0FBQSx1QkFBQSxDQUFBLENBQTBCLFNBQTFCLENBQUEsV0FBQSxDQUFBLENBQWlELElBQWpELENBQUEsQ0FBQSxDQUFkO2FBQ0EsT0FBTyxDQUFDLEtBQVIsQ0FBYyxDQUFBLG9CQUFBLENBQUEsQ0FBdUIsSUFBSSxDQUFDLFNBQUwsQ0FBZSxJQUFmLENBQXZCLENBQUEsQ0FBZCxFQVBGOztFQUppQjtBQXJVbUIiLCJzb3VyY2VzQ29udGVudCI6WyIjIENvZmZlZVNjcmlwdCBjYW4gYmUgdXNlZCBib3RoIG9uIHRoZSBzZXJ2ZXIsIGFzIGEgY29tbWFuZC1saW5lIGNvbXBpbGVyIGJhc2VkXG4jIG9uIE5vZGUuanMvVjgsIG9yIHRvIHJ1biBDb2ZmZWVTY3JpcHQgZGlyZWN0bHkgaW4gdGhlIGJyb3dzZXIuIFRoaXMgbW9kdWxlXG4jIGNvbnRhaW5zIHRoZSBtYWluIGVudHJ5IGZ1bmN0aW9ucyBmb3IgdG9rZW5pemluZywgcGFyc2luZywgYW5kIGNvbXBpbGluZ1xuIyBzb3VyY2UgQ29mZmVlU2NyaXB0IGludG8gSmF2YVNjcmlwdC5cblxue0xleGVyfSAgICAgICA9IHJlcXVpcmUgJy4vbGV4ZXInXG57cGFyc2VyfSAgICAgID0gcmVxdWlyZSAnLi9wYXJzZXInXG5oZWxwZXJzICAgICAgID0gcmVxdWlyZSAnLi9oZWxwZXJzJ1xuU291cmNlTWFwICAgICA9IHJlcXVpcmUgJy4vc291cmNlbWFwJ1xuIyBSZXF1aXJlIGBwYWNrYWdlLmpzb25gLCB3aGljaCBpcyB0d28gbGV2ZWxzIGFib3ZlIHRoaXMgZmlsZSwgYXMgdGhpcyBmaWxlIGlzXG4jIGV2YWx1YXRlZCBmcm9tIGBsaWIvY29mZmVlc2NyaXB0YC5cbnBhY2thZ2VKc29uICAgPSByZXF1aXJlICcuLi8uLi9wYWNrYWdlLmpzb24nXG5cbiMgVGhlIGN1cnJlbnQgQ29mZmVlU2NyaXB0IHZlcnNpb24gbnVtYmVyLlxuZXhwb3J0cy5WRVJTSU9OID0gcGFja2FnZUpzb24udmVyc2lvblxuXG5leHBvcnRzLkZJTEVfRVhURU5TSU9OUyA9IEZJTEVfRVhURU5TSU9OUyA9IFsnLmNvZmZlZScsICcubGl0Y29mZmVlJywgJy5jb2ZmZWUubWQnXVxuXG4jIEV4cG9zZSBoZWxwZXJzIGZvciB0ZXN0aW5nLlxuZXhwb3J0cy5oZWxwZXJzID0gaGVscGVyc1xuXG57Z2V0U291cmNlTWFwLCByZWdpc3RlckNvbXBpbGVkfSA9IFNvdXJjZU1hcFxuIyBUaGlzIGlzIGV4cG9ydGVkIHRvIGVuYWJsZSBhbiBleHRlcm5hbCBtb2R1bGUgdG8gaW1wbGVtZW50IGNhY2hpbmcgb2ZcbiMgc291cmNlbWFwcy4gVGhpcyBpcyB1c2VkIG9ubHkgd2hlbiBgcGF0Y2hTdGFja1RyYWNlYCBoYXMgYmVlbiBjYWxsZWQgdG8gYWRqdXN0XG4jIHN0YWNrIHRyYWNlcyBmb3IgZmlsZXMgd2l0aCBjYWNoZWQgc291cmNlIG1hcHMuXG5leHBvcnRzLnJlZ2lzdGVyQ29tcGlsZWQgPSByZWdpc3RlckNvbXBpbGVkXG5cbiMgRnVuY3Rpb24gdGhhdCBhbGxvd3MgZm9yIGJ0b2EgaW4gYm90aCBub2RlanMgYW5kIHRoZSBicm93c2VyLlxuYmFzZTY0ZW5jb2RlID0gKHNyYykgLT4gc3dpdGNoXG4gIHdoZW4gdHlwZW9mIEJ1ZmZlciBpcyAnZnVuY3Rpb24nXG4gICAgQnVmZmVyLmZyb20oc3JjKS50b1N0cmluZygnYmFzZTY0JylcbiAgd2hlbiB0eXBlb2YgYnRvYSBpcyAnZnVuY3Rpb24nXG4gICAgIyBUaGUgY29udGVudHMgb2YgYSBgPHNjcmlwdD5gIGJsb2NrIGFyZSBlbmNvZGVkIHZpYSBVVEYtMTYsIHNvIGlmIGFueSBleHRlbmRlZFxuICAgICMgY2hhcmFjdGVycyBhcmUgdXNlZCBpbiB0aGUgYmxvY2ssIGJ0b2Egd2lsbCBmYWlsIGFzIGl0IG1heGVzIG91dCBhdCBVVEYtOC5cbiAgICAjIFNlZSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvV2luZG93QmFzZTY0L0Jhc2U2NF9lbmNvZGluZ19hbmRfZGVjb2RpbmcjVGhlX1VuaWNvZGVfUHJvYmxlbVxuICAgICMgZm9yIHRoZSBnb3J5IGRldGFpbHMsIGFuZCBmb3IgdGhlIHNvbHV0aW9uIGltcGxlbWVudGVkIGhlcmUuXG4gICAgYnRvYSBlbmNvZGVVUklDb21wb25lbnQoc3JjKS5yZXBsYWNlIC8lKFswLTlBLUZdezJ9KS9nLCAobWF0Y2gsIHAxKSAtPlxuICAgICAgU3RyaW5nLmZyb21DaGFyQ29kZSAnMHgnICsgcDFcbiAgZWxzZVxuICAgIHRocm93IG5ldyBFcnJvcignVW5hYmxlIHRvIGJhc2U2NCBlbmNvZGUgaW5saW5lIHNvdXJjZW1hcC4nKVxuXG4jIEZ1bmN0aW9uIHdyYXBwZXIgdG8gYWRkIHNvdXJjZSBmaWxlIGluZm9ybWF0aW9uIHRvIFN5bnRheEVycm9ycyB0aHJvd24gYnkgdGhlXG4jIGxleGVyL3BhcnNlci9jb21waWxlci5cbndpdGhQcmV0dHlFcnJvcnMgPSAoZm4pIC0+XG4gIChjb2RlLCBvcHRpb25zID0ge30sIGhhbmRsZXIgPSBudWxsICkgLT5cbiAgICB0cnlcbiAgICAgIGZuLmNhbGwgQCwgY29kZSwgb3B0aW9ucywgaGFuZGxlclxuICAgIGNhdGNoIGVyclxuICAgICAgdGhyb3cgZXJyIGlmIHR5cGVvZiBjb2RlIGlzbnQgJ3N0cmluZycgIyBTdXBwb3J0IGBDb2ZmZWVTY3JpcHQubm9kZXModG9rZW5zKWAuXG4gICAgICB0aHJvdyBoZWxwZXJzLnVwZGF0ZVN5bnRheEVycm9yIGVyciwgY29kZSwgb3B0aW9ucy5maWxlbmFtZVxuXG4jIENvbXBpbGUgQ29mZmVlU2NyaXB0IGNvZGUgdG8gSmF2YVNjcmlwdCwgdXNpbmcgdGhlIENvZmZlZS9KaXNvbiBjb21waWxlci5cbiNcbiMgSWYgYG9wdGlvbnMuc291cmNlTWFwYCBpcyBzcGVjaWZpZWQsIHRoZW4gYG9wdGlvbnMuZmlsZW5hbWVgIG11c3QgYWxzbyBiZVxuIyBzcGVjaWZpZWQuIEFsbCBvcHRpb25zIHRoYXQgY2FuIGJlIHBhc3NlZCB0byBgU291cmNlTWFwI2dlbmVyYXRlYCBtYXkgYWxzb1xuIyBiZSBwYXNzZWQgaGVyZS5cbiNcbiMgVGhpcyByZXR1cm5zIGEgamF2YXNjcmlwdCBzdHJpbmcsIHVubGVzcyBgb3B0aW9ucy5zb3VyY2VNYXBgIGlzIHBhc3NlZCxcbiMgaW4gd2hpY2ggY2FzZSB0aGlzIHJldHVybnMgYSBge2pzLCB2M1NvdXJjZU1hcCwgc291cmNlTWFwfWBcbiMgb2JqZWN0LCB3aGVyZSBzb3VyY2VNYXAgaXMgYSBzb3VyY2VtYXAuY29mZmVlI1NvdXJjZU1hcCBvYmplY3QsIGhhbmR5IGZvclxuIyBkb2luZyBwcm9ncmFtbWF0aWMgbG9va3Vwcy5cbmV4cG9ydHMuY29tcGlsZSA9IGNvbXBpbGUgPSB3aXRoUHJldHR5RXJyb3JzIChjb2RlLCBvcHRpb25zID0ge30sIGhhbmRsZXIgPSBudWxsKSAtPiAjICEhISEhISEhISFcbiMgZXhwb3J0cy5jb21waWxlID0gY29tcGlsZSA9IHdpdGhQcmV0dHlFcnJvcnMgKGNvZGUsIG9wdGlvbnMgPSB7fSkgLT5cbiAgIyBjb25zb2xlLmxvZyAnzqlDU19fXzEnLCBcImNvbXBpbGUoKVwiLCBoYW5kbGVyICMgISEhISEhISEhISEhISEhISEhXG4gICMgQ2xvbmUgYG9wdGlvbnNgLCB0byBhdm9pZCBtdXRhdGluZyB0aGUgYG9wdGlvbnNgIG9iamVjdCBwYXNzZWQgaW4uXG4gIG9wdGlvbnMgPSBPYmplY3QuYXNzaWduIHt9LCBvcHRpb25zXG5cbiAgZ2VuZXJhdGVTb3VyY2VNYXAgPSBvcHRpb25zLnNvdXJjZU1hcCBvciBvcHRpb25zLmlubGluZU1hcCBvciBub3Qgb3B0aW9ucy5maWxlbmFtZT9cbiAgZmlsZW5hbWUgPSBvcHRpb25zLmZpbGVuYW1lIG9yIGhlbHBlcnMuYW5vbnltb3VzRmlsZU5hbWUoKVxuXG4gIGNoZWNrU2hlYmFuZ0xpbmUgZmlsZW5hbWUsIGNvZGVcblxuICBtYXAgPSBuZXcgU291cmNlTWFwIGlmIGdlbmVyYXRlU291cmNlTWFwXG5cbiAgdG9rZW5zID0gbGV4ZXIudG9rZW5pemUgY29kZSwgb3B0aW9uc1xuICBoYW5kbGVyIHsgdG9rZW5zLCB9IGlmIGhhbmRsZXI/XG5cbiAgIyBQYXNzIGEgbGlzdCBvZiByZWZlcmVuY2VkIHZhcmlhYmxlcywgc28gdGhhdCBnZW5lcmF0ZWQgdmFyaWFibGVzIHdvbuKAmXQgZ2V0XG4gICMgdGhlIHNhbWUgbmFtZS5cbiAgb3B0aW9ucy5yZWZlcmVuY2VkVmFycyA9IChcbiAgICB0b2tlblsxXSBmb3IgdG9rZW4gaW4gdG9rZW5zIHdoZW4gdG9rZW5bMF0gaXMgJ0lERU5USUZJRVInXG4gIClcblxuICAjIENoZWNrIGZvciBpbXBvcnQgb3IgZXhwb3J0OyBpZiBmb3VuZCwgZm9yY2UgYmFyZSBtb2RlLlxuICB1bmxlc3Mgb3B0aW9ucy5iYXJlPyBhbmQgb3B0aW9ucy5iYXJlIGlzIHllc1xuICAgIGZvciB0b2tlbiBpbiB0b2tlbnNcbiAgICAgIGlmIHRva2VuWzBdIGluIFsnSU1QT1JUJywgJ0VYUE9SVCddXG4gICAgICAgIG9wdGlvbnMuYmFyZSA9IHllc1xuICAgICAgICBicmVha1xuXG4gIG5vZGVzID0gcGFyc2VyLnBhcnNlIHRva2Vuc1xuICBoYW5kbGVyIHsgbm9kZXMsIH0gaWYgaGFuZGxlcj9cbiAgIyBJZiBhbGwgdGhhdCB3YXMgcmVxdWVzdGVkIHdhcyBhIFBPSk8gcmVwcmVzZW50YXRpb24gb2YgdGhlIG5vZGVzLCBlLmcuXG4gICMgdGhlIGFic3RyYWN0IHN5bnRheCB0cmVlIChBU1QpLCB3ZSBjYW4gc3RvcCBub3cgYW5kIGp1c3QgcmV0dXJuIHRoYXRcbiAgIyAoYWZ0ZXIgZml4aW5nIHRoZSBsb2NhdGlvbiBkYXRhIGZvciB0aGUgcm9vdC9gRmlsZWDCu2BQcm9ncmFtYCBub2RlLFxuICAjIHdoaWNoIG1pZ2h04oCZdmUgZ290dGVuIG1pc2FsaWduZWQgZnJvbSB0aGUgb3JpZ2luYWwgc291cmNlIGR1ZSB0byB0aGVcbiAgIyBgY2xlYW5gIGZ1bmN0aW9uIGluIHRoZSBsZXhlcikuXG4gIGlmIG9wdGlvbnMuYXN0XG4gICAgbm9kZXMuYWxsQ29tbWVudFRva2VucyA9IGhlbHBlcnMuZXh0cmFjdEFsbENvbW1lbnRUb2tlbnMgdG9rZW5zXG4gICAgc291cmNlQ29kZU51bWJlck9mTGluZXMgPSAoY29kZS5tYXRjaCgvXFxyP1xcbi9nKSBvciAnJykubGVuZ3RoICsgMVxuICAgIHNvdXJjZUNvZGVMYXN0TGluZSA9IC8uKiQvLmV4ZWMoY29kZSlbMF0gIyBgLipgIG1hdGNoZXMgYWxsIGJ1dCBsaW5lIGJyZWFrIGNoYXJhY3RlcnMuXG4gICAgYXN0ID0gbm9kZXMuYXN0IG9wdGlvbnNcbiAgICByYW5nZSA9IFswLCBjb2RlLmxlbmd0aF1cbiAgICBhc3Quc3RhcnQgPSBhc3QucHJvZ3JhbS5zdGFydCA9IHJhbmdlWzBdXG4gICAgYXN0LmVuZCA9IGFzdC5wcm9ncmFtLmVuZCA9IHJhbmdlWzFdXG4gICAgYXN0LnJhbmdlID0gYXN0LnByb2dyYW0ucmFuZ2UgPSByYW5nZVxuICAgIGFzdC5sb2Muc3RhcnQgPSBhc3QucHJvZ3JhbS5sb2Muc3RhcnQgPSB7bGluZTogMSwgY29sdW1uOiAwfVxuICAgIGFzdC5sb2MuZW5kLmxpbmUgPSBhc3QucHJvZ3JhbS5sb2MuZW5kLmxpbmUgPSBzb3VyY2VDb2RlTnVtYmVyT2ZMaW5lc1xuICAgIGFzdC5sb2MuZW5kLmNvbHVtbiA9IGFzdC5wcm9ncmFtLmxvYy5lbmQuY29sdW1uID0gc291cmNlQ29kZUxhc3RMaW5lLmxlbmd0aFxuICAgIGFzdC50b2tlbnMgPSB0b2tlbnNcbiAgICByZXR1cm4gYXN0XG5cbiAgZnJhZ21lbnRzID0gbm9kZXMuY29tcGlsZVRvRnJhZ21lbnRzIG9wdGlvbnNcblxuICBjdXJyZW50TGluZSA9IDBcbiAgY3VycmVudExpbmUgKz0gMSBpZiBvcHRpb25zLmhlYWRlclxuICBjdXJyZW50TGluZSArPSAxIGlmIG9wdGlvbnMuc2hpZnRMaW5lXG4gIGN1cnJlbnRDb2x1bW4gPSAwXG4gIGpzID0gXCJcIlxuICBmb3IgZnJhZ21lbnQgaW4gZnJhZ21lbnRzXG4gICAgIyBVcGRhdGUgdGhlIHNvdXJjZW1hcCB3aXRoIGRhdGEgZnJvbSBlYWNoIGZyYWdtZW50LlxuICAgIGlmIGdlbmVyYXRlU291cmNlTWFwXG4gICAgICAjIERvIG5vdCBpbmNsdWRlIGVtcHR5LCB3aGl0ZXNwYWNlLCBvciBzZW1pY29sb24tb25seSBmcmFnbWVudHMuXG4gICAgICBpZiBmcmFnbWVudC5sb2NhdGlvbkRhdGEgYW5kIG5vdCAvXls7XFxzXSokLy50ZXN0IGZyYWdtZW50LmNvZGVcbiAgICAgICAgbWFwLmFkZChcbiAgICAgICAgICBbZnJhZ21lbnQubG9jYXRpb25EYXRhLmZpcnN0X2xpbmUsIGZyYWdtZW50LmxvY2F0aW9uRGF0YS5maXJzdF9jb2x1bW5dXG4gICAgICAgICAgW2N1cnJlbnRMaW5lLCBjdXJyZW50Q29sdW1uXVxuICAgICAgICAgIHtub1JlcGxhY2U6IHRydWV9KVxuICAgICAgbmV3TGluZXMgPSBoZWxwZXJzLmNvdW50IGZyYWdtZW50LmNvZGUsIFwiXFxuXCJcbiAgICAgIGN1cnJlbnRMaW5lICs9IG5ld0xpbmVzXG4gICAgICBpZiBuZXdMaW5lc1xuICAgICAgICBjdXJyZW50Q29sdW1uID0gZnJhZ21lbnQuY29kZS5sZW5ndGggLSAoZnJhZ21lbnQuY29kZS5sYXN0SW5kZXhPZihcIlxcblwiKSArIDEpXG4gICAgICBlbHNlXG4gICAgICAgIGN1cnJlbnRDb2x1bW4gKz0gZnJhZ21lbnQuY29kZS5sZW5ndGhcblxuICAgICMgQ29weSB0aGUgY29kZSBmcm9tIGVhY2ggZnJhZ21lbnQgaW50byB0aGUgZmluYWwgSmF2YVNjcmlwdC5cbiAgICBqcyArPSBmcmFnbWVudC5jb2RlXG5cbiAgaWYgb3B0aW9ucy5oZWFkZXJcbiAgICBoZWFkZXIgPSBcIkdlbmVyYXRlZCBieSBDb2ZmZWVTY3JpcHQgI3tAVkVSU0lPTn1cIlxuICAgIGpzID0gXCIvLyAje2hlYWRlcn1cXG4je2pzfVwiXG5cbiAgaWYgZ2VuZXJhdGVTb3VyY2VNYXBcbiAgICB2M1NvdXJjZU1hcCA9IG1hcC5nZW5lcmF0ZSBvcHRpb25zLCBjb2RlXG5cbiAgaWYgb3B0aW9ucy50cmFuc3BpbGVcbiAgICBpZiB0eXBlb2Ygb3B0aW9ucy50cmFuc3BpbGUgaXNudCAnb2JqZWN0J1xuICAgICAgIyBUaGlzIG9ubHkgaGFwcGVucyBpZiBydW4gdmlhIHRoZSBOb2RlIEFQSSBhbmQgYHRyYW5zcGlsZWAgaXMgc2V0IHRvXG4gICAgICAjIHNvbWV0aGluZyBvdGhlciB0aGFuIGFuIG9iamVjdC5cbiAgICAgIHRocm93IG5ldyBFcnJvciAnVGhlIHRyYW5zcGlsZSBvcHRpb24gbXVzdCBiZSBnaXZlbiBhbiBvYmplY3Qgd2l0aCBvcHRpb25zIHRvIHBhc3MgdG8gQmFiZWwnXG5cbiAgICAjIEdldCB0aGUgcmVmZXJlbmNlIHRvIEJhYmVsIHRoYXQgd2UgaGF2ZSBiZWVuIHBhc3NlZCBpZiB0aGlzIGNvbXBpbGVyXG4gICAgIyBpcyBydW4gdmlhIHRoZSBDTEkgb3IgTm9kZSBBUEkuXG4gICAgdHJhbnNwaWxlciA9IG9wdGlvbnMudHJhbnNwaWxlLnRyYW5zcGlsZVxuICAgIGRlbGV0ZSBvcHRpb25zLnRyYW5zcGlsZS50cmFuc3BpbGVcblxuICAgIHRyYW5zcGlsZXJPcHRpb25zID0gT2JqZWN0LmFzc2lnbiB7fSwgb3B0aW9ucy50cmFuc3BpbGVcblxuICAgICMgU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9iYWJlbC9iYWJlbC9pc3N1ZXMvODI3I2lzc3VlY29tbWVudC03NzU3MzEwNzpcbiAgICAjIEJhYmVsIGNhbiB0YWtlIGEgdjMgc291cmNlIG1hcCBvYmplY3QgYXMgaW5wdXQgaW4gYGlucHV0U291cmNlTWFwYFxuICAgICMgYW5kIGl0IHdpbGwgcmV0dXJuIGFuICp1cGRhdGVkKiB2MyBzb3VyY2UgbWFwIG9iamVjdCBpbiBpdHMgb3V0cHV0LlxuICAgIGlmIHYzU291cmNlTWFwIGFuZCBub3QgdHJhbnNwaWxlck9wdGlvbnMuaW5wdXRTb3VyY2VNYXA/XG4gICAgICB0cmFuc3BpbGVyT3B0aW9ucy5pbnB1dFNvdXJjZU1hcCA9IHYzU291cmNlTWFwXG4gICAgdHJhbnNwaWxlck91dHB1dCA9IHRyYW5zcGlsZXIganMsIHRyYW5zcGlsZXJPcHRpb25zXG4gICAganMgPSB0cmFuc3BpbGVyT3V0cHV0LmNvZGVcbiAgICBpZiB2M1NvdXJjZU1hcCBhbmQgdHJhbnNwaWxlck91dHB1dC5tYXBcbiAgICAgIHYzU291cmNlTWFwID0gdHJhbnNwaWxlck91dHB1dC5tYXBcblxuICBpZiBvcHRpb25zLmlubGluZU1hcFxuICAgIGVuY29kZWQgPSBiYXNlNjRlbmNvZGUgSlNPTi5zdHJpbmdpZnkgdjNTb3VyY2VNYXBcbiAgICBzb3VyY2VNYXBEYXRhVVJJID0gXCIvLyMgc291cmNlTWFwcGluZ1VSTD1kYXRhOmFwcGxpY2F0aW9uL2pzb247YmFzZTY0LCN7ZW5jb2RlZH1cIlxuICAgIHNvdXJjZVVSTCA9IFwiLy8jIHNvdXJjZVVSTD0je2ZpbGVuYW1lfVwiXG4gICAganMgPSBcIiN7anN9XFxuI3tzb3VyY2VNYXBEYXRhVVJJfVxcbiN7c291cmNlVVJMfVwiXG5cbiAgcmVnaXN0ZXJDb21waWxlZCBmaWxlbmFtZSwgY29kZSwgbWFwXG5cbiAgaWYgb3B0aW9ucy5zb3VyY2VNYXBcbiAgICB7XG4gICAgICBqc1xuICAgICAgc291cmNlTWFwOiBtYXBcbiAgICAgIHYzU291cmNlTWFwOiBKU09OLnN0cmluZ2lmeSB2M1NvdXJjZU1hcCwgbnVsbCwgMlxuICAgIH1cbiAgZWxzZVxuICAgIGpzXG5cbiMgVG9rZW5pemUgYSBzdHJpbmcgb2YgQ29mZmVlU2NyaXB0IGNvZGUsIGFuZCByZXR1cm4gdGhlIGFycmF5IG9mIHRva2Vucy5cbmV4cG9ydHMudG9rZW5zID0gd2l0aFByZXR0eUVycm9ycyAoY29kZSwgb3B0aW9ucykgLT5cbiAgbGV4ZXIudG9rZW5pemUgY29kZSwgb3B0aW9uc1xuXG4jIFBhcnNlIGEgc3RyaW5nIG9mIENvZmZlZVNjcmlwdCBjb2RlIG9yIGFuIGFycmF5IG9mIGxleGVkIHRva2VucywgYW5kXG4jIHJldHVybiB0aGUgQVNULiBZb3UgY2FuIHRoZW4gY29tcGlsZSBpdCBieSBjYWxsaW5nIGAuY29tcGlsZSgpYCBvbiB0aGUgcm9vdCxcbiMgb3IgdHJhdmVyc2UgaXQgYnkgdXNpbmcgYC50cmF2ZXJzZUNoaWxkcmVuKClgIHdpdGggYSBjYWxsYmFjay5cbmV4cG9ydHMubm9kZXMgPSB3aXRoUHJldHR5RXJyb3JzIChzb3VyY2UsIG9wdGlvbnMpIC0+XG4gIHNvdXJjZSA9IGxleGVyLnRva2VuaXplIHNvdXJjZSwgb3B0aW9ucyBpZiB0eXBlb2Ygc291cmNlIGlzICdzdHJpbmcnXG4gIHBhcnNlci5wYXJzZSBzb3VyY2VcblxuIyBUaGlzIGZpbGUgdXNlZCB0byBleHBvcnQgdGhlc2UgbWV0aG9kczsgbGVhdmUgc3R1YnMgdGhhdCB0aHJvdyB3YXJuaW5nc1xuIyBpbnN0ZWFkLiBUaGVzZSBtZXRob2RzIGhhdmUgYmVlbiBtb3ZlZCBpbnRvIGBpbmRleC5jb2ZmZWVgIHRvIHByb3ZpZGVcbiMgc2VwYXJhdGUgZW50cnlwb2ludHMgZm9yIE5vZGUgYW5kIG5vbi1Ob2RlIGVudmlyb25tZW50cywgc28gdGhhdCBzdGF0aWNcbiMgYW5hbHlzaXMgdG9vbHMgZG9u4oCZdCBjaG9rZSBvbiBOb2RlIHBhY2thZ2VzIHdoZW4gY29tcGlsaW5nIGZvciBhIG5vbi1Ob2RlXG4jIGVudmlyb25tZW50LlxuZXhwb3J0cy5ydW4gPSBleHBvcnRzLmV2YWwgPSBleHBvcnRzLnJlZ2lzdGVyID0gLT5cbiAgdGhyb3cgbmV3IEVycm9yICdyZXF1aXJlIGluZGV4LmNvZmZlZSwgbm90IHRoaXMgZmlsZSdcblxuIyBJbnN0YW50aWF0ZSBhIExleGVyIGZvciBvdXIgdXNlIGhlcmUuXG5sZXhlciA9IG5ldyBMZXhlclxuXG4jIFRoZSByZWFsIExleGVyIHByb2R1Y2VzIGEgZ2VuZXJpYyBzdHJlYW0gb2YgdG9rZW5zLiBUaGlzIG9iamVjdCBwcm92aWRlcyBhXG4jIHRoaW4gd3JhcHBlciBhcm91bmQgaXQsIGNvbXBhdGlibGUgd2l0aCB0aGUgSmlzb24gQVBJLiBXZSBjYW4gdGhlbiBwYXNzIGl0XG4jIGRpcmVjdGx5IGFzIGEg4oCcSmlzb24gbGV4ZXIu4oCdXG5wYXJzZXIubGV4ZXIgPVxuICB5eWxsb2M6XG4gICAgcmFuZ2U6IFtdXG4gIG9wdGlvbnM6XG4gICAgcmFuZ2VzOiB5ZXNcbiAgbGV4OiAtPlxuICAgIHRva2VuID0gcGFyc2VyLnRva2Vuc1tAcG9zKytdXG4gICAgaWYgdG9rZW5cbiAgICAgIFt0YWcsIEB5eXRleHQsIEB5eWxsb2NdID0gdG9rZW5cbiAgICAgIHBhcnNlci5lcnJvclRva2VuID0gdG9rZW4ub3JpZ2luIG9yIHRva2VuXG4gICAgICBAeXlsaW5lbm8gPSBAeXlsbG9jLmZpcnN0X2xpbmVcbiAgICBlbHNlXG4gICAgICB0YWcgPSAnJ1xuICAgIHRhZ1xuICBzZXRJbnB1dDogKHRva2VucykgLT5cbiAgICBwYXJzZXIudG9rZW5zID0gdG9rZW5zXG4gICAgQHBvcyA9IDBcbiAgdXBjb21pbmdJbnB1dDogLT4gJydcblxuIyBNYWtlIGFsbCB0aGUgQVNUIG5vZGVzIHZpc2libGUgdG8gdGhlIHBhcnNlci5cbnBhcnNlci55eSA9IHJlcXVpcmUgJy4vbm9kZXMnXG5cbiMgT3ZlcnJpZGUgSmlzb24ncyBkZWZhdWx0IGVycm9yIGhhbmRsaW5nIGZ1bmN0aW9uLlxucGFyc2VyLnl5LnBhcnNlRXJyb3IgPSAobWVzc2FnZSwge3Rva2VufSkgLT5cbiAgIyBEaXNyZWdhcmQgSmlzb24ncyBtZXNzYWdlLCBpdCBjb250YWlucyByZWR1bmRhbnQgbGluZSBudW1iZXIgaW5mb3JtYXRpb24uXG4gICMgRGlzcmVnYXJkIHRoZSB0b2tlbiwgd2UgdGFrZSBpdHMgdmFsdWUgZGlyZWN0bHkgZnJvbSB0aGUgbGV4ZXIgaW4gY2FzZVxuICAjIHRoZSBlcnJvciBpcyBjYXVzZWQgYnkgYSBnZW5lcmF0ZWQgdG9rZW4gd2hpY2ggbWlnaHQgcmVmZXIgdG8gaXRzIG9yaWdpbi5cbiAge2Vycm9yVG9rZW4sIHRva2Vuc30gPSBwYXJzZXJcbiAgW2Vycm9yVGFnLCBlcnJvclRleHQsIGVycm9yTG9jXSA9IGVycm9yVG9rZW5cblxuICBlcnJvclRleHQgPSBzd2l0Y2hcbiAgICB3aGVuIGVycm9yVG9rZW4gaXMgdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXVxuICAgICAgJ2VuZCBvZiBpbnB1dCdcbiAgICB3aGVuIGVycm9yVGFnIGluIFsnSU5ERU5UJywgJ09VVERFTlQnXVxuICAgICAgJ2luZGVudGF0aW9uJ1xuICAgIHdoZW4gZXJyb3JUYWcgaW4gWydJREVOVElGSUVSJywgJ05VTUJFUicsICdJTkZJTklUWScsICdTVFJJTkcnLCAnU1RSSU5HX1NUQVJUJywgJ1JFR0VYJywgJ1JFR0VYX1NUQVJUJ11cbiAgICAgIGVycm9yVGFnLnJlcGxhY2UoL19TVEFSVCQvLCAnJykudG9Mb3dlckNhc2UoKVxuICAgIGVsc2VcbiAgICAgIGhlbHBlcnMubmFtZVdoaXRlc3BhY2VDaGFyYWN0ZXIgZXJyb3JUZXh0XG5cbiAgIyBUaGUgc2Vjb25kIGFyZ3VtZW50IGhhcyBhIGBsb2NgIHByb3BlcnR5LCB3aGljaCBzaG91bGQgaGF2ZSB0aGUgbG9jYXRpb25cbiAgIyBkYXRhIGZvciB0aGlzIHRva2VuLiBVbmZvcnR1bmF0ZWx5LCBKaXNvbiBzZWVtcyB0byBzZW5kIGFuIG91dGRhdGVkIGBsb2NgXG4gICMgKGZyb20gdGhlIHByZXZpb3VzIHRva2VuKSwgc28gd2UgdGFrZSB0aGUgbG9jYXRpb24gaW5mb3JtYXRpb24gZGlyZWN0bHlcbiAgIyBmcm9tIHRoZSBsZXhlci5cbiAgaGVscGVycy50aHJvd1N5bnRheEVycm9yIFwidW5leHBlY3RlZCAje2Vycm9yVGV4dH1cIiwgZXJyb3JMb2NcblxuZXhwb3J0cy5wYXRjaFN0YWNrVHJhY2UgPSAtPlxuICAjIEJhc2VkIG9uIGh0dHA6Ly92OC5nb29nbGVjb2RlLmNvbS9zdm4vYnJhbmNoZXMvYmxlZWRpbmdfZWRnZS9zcmMvbWVzc2FnZXMuanNcbiAgIyBNb2RpZmllZCB0byBoYW5kbGUgc291cmNlTWFwXG4gIGZvcm1hdFNvdXJjZVBvc2l0aW9uID0gKGZyYW1lLCBnZXRTb3VyY2VNYXBwaW5nKSAtPlxuICAgIGZpbGVuYW1lID0gdW5kZWZpbmVkXG4gICAgZmlsZUxvY2F0aW9uID0gJydcblxuICAgIGlmIGZyYW1lLmlzTmF0aXZlKClcbiAgICAgIGZpbGVMb2NhdGlvbiA9IFwibmF0aXZlXCJcbiAgICBlbHNlXG4gICAgICBpZiBmcmFtZS5pc0V2YWwoKVxuICAgICAgICBmaWxlbmFtZSA9IGZyYW1lLmdldFNjcmlwdE5hbWVPclNvdXJjZVVSTCgpXG4gICAgICAgIGZpbGVMb2NhdGlvbiA9IFwiI3tmcmFtZS5nZXRFdmFsT3JpZ2luKCl9LCBcIiB1bmxlc3MgZmlsZW5hbWVcbiAgICAgIGVsc2VcbiAgICAgICAgZmlsZW5hbWUgPSBmcmFtZS5nZXRGaWxlTmFtZSgpXG5cbiAgICAgIGZpbGVuYW1lIG9yPSBcIjxhbm9ueW1vdXM+XCJcblxuICAgICAgbGluZSA9IGZyYW1lLmdldExpbmVOdW1iZXIoKVxuICAgICAgY29sdW1uID0gZnJhbWUuZ2V0Q29sdW1uTnVtYmVyKClcblxuICAgICAgIyBDaGVjayBmb3IgYSBzb3VyY2VNYXAgcG9zaXRpb25cbiAgICAgIHNvdXJjZSA9IGdldFNvdXJjZU1hcHBpbmcgZmlsZW5hbWUsIGxpbmUsIGNvbHVtblxuICAgICAgZmlsZUxvY2F0aW9uID1cbiAgICAgICAgaWYgc291cmNlXG4gICAgICAgICAgXCIje2ZpbGVuYW1lfToje3NvdXJjZVswXX06I3tzb3VyY2VbMV19XCJcbiAgICAgICAgZWxzZVxuICAgICAgICAgIFwiI3tmaWxlbmFtZX06I3tsaW5lfToje2NvbHVtbn1cIlxuXG4gICAgZnVuY3Rpb25OYW1lID0gZnJhbWUuZ2V0RnVuY3Rpb25OYW1lKClcbiAgICBpc0NvbnN0cnVjdG9yID0gZnJhbWUuaXNDb25zdHJ1Y3RvcigpXG4gICAgaXNNZXRob2RDYWxsID0gbm90IChmcmFtZS5pc1RvcGxldmVsKCkgb3IgaXNDb25zdHJ1Y3RvcilcblxuICAgIGlmIGlzTWV0aG9kQ2FsbFxuICAgICAgbWV0aG9kTmFtZSA9IGZyYW1lLmdldE1ldGhvZE5hbWUoKVxuICAgICAgdHlwZU5hbWUgPSBmcmFtZS5nZXRUeXBlTmFtZSgpXG5cbiAgICAgIGlmIGZ1bmN0aW9uTmFtZVxuICAgICAgICB0cCA9IGFzID0gJydcbiAgICAgICAgaWYgdHlwZU5hbWUgYW5kIGZ1bmN0aW9uTmFtZS5pbmRleE9mIHR5cGVOYW1lXG4gICAgICAgICAgdHAgPSBcIiN7dHlwZU5hbWV9LlwiXG4gICAgICAgIGlmIG1ldGhvZE5hbWUgYW5kIGZ1bmN0aW9uTmFtZS5pbmRleE9mKFwiLiN7bWV0aG9kTmFtZX1cIikgaXNudCBmdW5jdGlvbk5hbWUubGVuZ3RoIC0gbWV0aG9kTmFtZS5sZW5ndGggLSAxXG4gICAgICAgICAgYXMgPSBcIiBbYXMgI3ttZXRob2ROYW1lfV1cIlxuXG4gICAgICAgIFwiI3t0cH0je2Z1bmN0aW9uTmFtZX0je2FzfSAoI3tmaWxlTG9jYXRpb259KVwiXG4gICAgICBlbHNlXG4gICAgICAgIFwiI3t0eXBlTmFtZX0uI3ttZXRob2ROYW1lIG9yICc8YW5vbnltb3VzPid9ICgje2ZpbGVMb2NhdGlvbn0pXCJcbiAgICBlbHNlIGlmIGlzQ29uc3RydWN0b3JcbiAgICAgIFwibmV3ICN7ZnVuY3Rpb25OYW1lIG9yICc8YW5vbnltb3VzPid9ICgje2ZpbGVMb2NhdGlvbn0pXCJcbiAgICBlbHNlIGlmIGZ1bmN0aW9uTmFtZVxuICAgICAgXCIje2Z1bmN0aW9uTmFtZX0gKCN7ZmlsZUxvY2F0aW9ufSlcIlxuICAgIGVsc2VcbiAgICAgIGZpbGVMb2NhdGlvblxuXG4gIGdldFNvdXJjZU1hcHBpbmcgPSAoZmlsZW5hbWUsIGxpbmUsIGNvbHVtbikgLT5cbiAgICBzb3VyY2VNYXAgPSBnZXRTb3VyY2VNYXAgZmlsZW5hbWUsIGxpbmUsIGNvbHVtblxuXG4gICAgYW5zd2VyID0gc291cmNlTWFwLnNvdXJjZUxvY2F0aW9uIFtsaW5lIC0gMSwgY29sdW1uIC0gMV0gaWYgc291cmNlTWFwP1xuICAgIGlmIGFuc3dlcj8gdGhlbiBbYW5zd2VyWzBdICsgMSwgYW5zd2VyWzFdICsgMV0gZWxzZSBudWxsXG5cbiAgIyBCYXNlZCBvbiBbbWljaGFlbGZpY2FycmEvQ29mZmVlU2NyaXB0UmVkdXhdKGh0dHA6Ly9nb28uZ2wvWlR4MXApXG4gICMgTm9kZUpTIC8gVjggaGF2ZSBubyBzdXBwb3J0IGZvciB0cmFuc2Zvcm1pbmcgcG9zaXRpb25zIGluIHN0YWNrIHRyYWNlcyB1c2luZ1xuICAjIHNvdXJjZU1hcCwgc28gd2UgbXVzdCBtb25rZXktcGF0Y2ggRXJyb3IgdG8gZGlzcGxheSBDb2ZmZWVTY3JpcHQgc291cmNlXG4gICMgcG9zaXRpb25zLlxuICBFcnJvci5wcmVwYXJlU3RhY2tUcmFjZSA9IChlcnIsIHN0YWNrKSAtPlxuICAgIGZyYW1lcyA9IGZvciBmcmFtZSBpbiBzdGFja1xuICAgICAgIyBEb27igJl0IGRpc3BsYXkgc3RhY2sgZnJhbWVzIGRlZXBlciB0aGFuIGBDb2ZmZWVTY3JpcHQucnVuYC5cbiAgICAgIGJyZWFrIGlmIGZyYW1lLmdldEZ1bmN0aW9uKCkgaXMgZXhwb3J0cy5ydW5cbiAgICAgIFwiICAgIGF0ICN7Zm9ybWF0U291cmNlUG9zaXRpb24gZnJhbWUsIGdldFNvdXJjZU1hcHBpbmd9XCJcblxuICAgIFwiI3tlcnIudG9TdHJpbmcoKX1cXG4je2ZyYW1lcy5qb2luICdcXG4nfVxcblwiXG5cbmNoZWNrU2hlYmFuZ0xpbmUgPSAoZmlsZSwgaW5wdXQpIC0+XG4gIGZpcnN0TGluZSA9IGlucHV0LnNwbGl0KC8kL20sIDEpWzBdXG4gIHJlc3QgPSBmaXJzdExpbmU/Lm1hdGNoKC9eIyFcXHMqKFteXFxzXStcXHMqKSguKikvKVxuICBhcmdzID0gcmVzdD9bMl0/LnNwbGl0KC9cXHMvKS5maWx0ZXIgKHMpIC0+IHMgaXNudCAnJ1xuICBpZiBhcmdzPy5sZW5ndGggPiAxXG4gICAgY29uc29sZS5lcnJvciAnJydcbiAgICAgIFRoZSBzY3JpcHQgdG8gYmUgcnVuIGJlZ2lucyB3aXRoIGEgc2hlYmFuZyBsaW5lIHdpdGggbW9yZSB0aGFuIG9uZVxuICAgICAgYXJndW1lbnQuIFRoaXMgc2NyaXB0IHdpbGwgZmFpbCBvbiBwbGF0Zm9ybXMgc3VjaCBhcyBMaW51eCB3aGljaCBvbmx5XG4gICAgICBhbGxvdyBhIHNpbmdsZSBhcmd1bWVudC5cbiAgICAnJydcbiAgICBjb25zb2xlLmVycm9yIFwiVGhlIHNoZWJhbmcgbGluZSB3YXM6ICcje2ZpcnN0TGluZX0nIGluIGZpbGUgJyN7ZmlsZX0nXCJcbiAgICBjb25zb2xlLmVycm9yIFwiVGhlIGFyZ3VtZW50cyB3ZXJlOiAje0pTT04uc3RyaW5naWZ5IGFyZ3N9XCJcbiJdfQ==
//# sourceURL=../src/coffeescript.coffee