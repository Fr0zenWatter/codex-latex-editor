// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: https://codemirror.net/5/LICENSE

/*
 * Author: Constantin Jucovschi (c.jucovschi@jacobs-university.de)
 * Licence: MIT
 */

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
  "use strict";

  CodeMirror.defineMode("stex", function(_config, parserConfig) {
    "use strict";

    function pushCommand(state, command) {
      state.cmdState.push(command);
    }

    function peekCommand(state) {
      if (state.cmdState.length > 0) {
        return state.cmdState[state.cmdState.length - 1];
      } else {
        return null;
      }
    }

    function popCommand(state) {
      var plug = state.cmdState.pop();
      if (plug) {
        plug.closeBracket();
      }
    }

    // returns the non-default plugin closest to the end of the list
    function getMostPowerful(state) {
      var context = state.cmdState;
      for (var i = context.length - 1; i >= 0; i--) {
        var plug = context[i];
        if (plug.name == "DEFAULT") {
          continue;
        }
        return plug;
      }
      return { styleIdentifier: function() { return null; } };
    }

    function addPluginPattern(pluginName, cmdStyle, styles) {
      return function () {
        this.name = pluginName;
        this.bracketNo = 0;
        this.style = cmdStyle;
        this.styles = styles;
        this.argument = null;   // \begin and \end have arguments that follow. These are stored in the plugin

        this.styleIdentifier = function() {
          return this.styles[this.bracketNo - 1] || null;
        };
        this.openBracket = function() {
          this.bracketNo++;
          return "bracket";
        };
        this.closeBracket = function() {};
      };
    }

    var plugins = {};

    plugins["importmodule"] = addPluginPattern("importmodule", "tag", ["string", "builtin"]);
    plugins["documentclass"] = addPluginPattern("documentclass", "tag", ["", "atom"]);
    plugins["usepackage"] = addPluginPattern("usepackage", "tag", ["atom"]);
    plugins["begin"] = addPluginPattern("begin", "environment", ["atom"]);
    plugins["end"] = addPluginPattern("end", "environment", ["atom"]);

    plugins["label"    ] = addPluginPattern("label"    , "tag", ["atom"]);
    plugins["ref"      ] = addPluginPattern("ref"      , "tag", ["atom"]);
    plugins["eqref"    ] = addPluginPattern("eqref"    , "tag", ["atom"]);
    plugins["cite"     ] = addPluginPattern("cite"     , "tag", ["atom"]);
    plugins["bibitem"  ] = addPluginPattern("bibitem"  , "tag", ["atom"]);
    plugins["Bibitem"  ] = addPluginPattern("Bibitem"  , "tag", ["atom"]);
    plugins["RBibitem" ] = addPluginPattern("RBibitem" , "tag", ["atom"]);

    // Local LaTeX Codex semantic colors; retain the upstream scanner.
    var references = /^(?:[cC]ite\w*|[cC]ref|[cC]refrange|ref|eqref|pageref|autoref|nameref|label|bibitem)$/;
    var greek = /^(?:var)?(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega)$/i;

    plugins["DEFAULT"] = function () {
      this.name = "DEFAULT";
      this.style = "tag";

      this.styleIdentifier = this.openBracket = this.closeBracket = function() {};
    };

    function setState(state, f) {
      state.f = f;
    }

    // called when in a normal (no environment) context
    function normal(source, state) {
      var plug;
      // ponytail: common math environments only; add project-specific environment names here if needed.
      var environment = source.match(/^\\begin\s*\{((?:equation|align|alignat|gather|multline|flalign|displaymath|math|aligned|alignedat|gathered|split|cases|[bpvBV]?matrix|smallmatrix|array)\*?)\}/);
      if (environment) {
        var end = new RegExp("^\\\\end\\s*\\{" + environment[1].replace("*", "\\*") + "\\}");
        setState(state, function(source, state) { return inMathMode(source, state, end); });
        return "environment";
      }
      // Do we look like '\command' ?  If so, attempt to apply the plugin 'command'
      if (source.match(/^\\[a-zA-Z@]+/)) {
        var cmdName = source.current().slice(1);
        plug = references.test(cmdName) ? addPluginPattern(cmdName, "reference", ["reference", "reference"]) :
          plugins.hasOwnProperty(cmdName) ? plugins[cmdName] : plugins["DEFAULT"];
        plug = new plug();
        pushCommand(state, plug);
        setState(state, beginParams);
        return plug.style;
      }

      // escape characters
      if (source.match(/^\\[$&%#{}_]/)) {
        return "tag";
      }

      // white space control characters
      if (source.match(/^\\[,;!\/\\]/)) {
        return "tag";
      }

      // find if we're starting various math modes
      if (source.match("\\[")) {
        setState(state, function(source, state){ return inMathMode(source, state, "\\]"); });
        return "math";
      }
      if (source.match("\\(")) {
        setState(state, function(source, state){ return inMathMode(source, state, "\\)"); });
        return "math";
      }
      if (source.match("$$")) {
        setState(state, function(source, state){ return inMathMode(source, state, "$$"); });
        return "math";
      }
      if (source.match("$")) {
        setState(state, function(source, state){ return inMathMode(source, state, "$"); });
        return "math";
      }

      var ch = source.next();
      if (ch == "%") {
        source.skipToEnd();
        return "comment";
      } else if (ch == '}' || ch == ']') {
        plug = peekCommand(state);
        if (plug) {
          plug.closeBracket(ch);
          setState(state, beginParams);
        } else {
          return "error";
        }
        return "bracket";
      } else if (ch == '{' || ch == '[') {
        plug = plugins["DEFAULT"];
        plug = new plug();
        pushCommand(state, plug);
        return "bracket";
      } else if (/\d/.test(ch)) {
        source.eatWhile(/[\w.%]/);
        return "atom";
      } else {
        source.eatWhile(/[\w\-_]/);
        plug = getMostPowerful(state);
        if (plug.name == 'begin') {
          plug.argument = source.current();
        }
        return plug.styleIdentifier();
      }
    }

    function inMathMode(source, state, endModeSeq) {
      if (source.eatSpace()) {
        return null;
      }
      if (endModeSeq && source.match(endModeSeq)) {
        setState(state, normal);
        return typeof endModeSeq == "string" ? "math" : "environment";
      }
      if (source.match(/^\\(?:begin|end)\s*\{[^}]+\}/)) return "environment";
      // Reference keys and prose inside math are not mathematical variables.
      if (state.mathReference) {
        state.mathReference = false;
        if (source.match(/^(?:\[[^\]]*\]\s*)*\{[^}]*\}/)) return "reference";
      }
      if (source.match(/^\\[a-zA-Z@]+/)) {
        var command = source.current().slice(1);
        if (references.test(command)) {
          state.mathReference = true;
          return "reference";
        }
        if (/^(?:text|textrm|textnormal|textbf|textit|mbox)$/.test(command)) {
          var resume = state.f;
          state.mathTextDepth = 0;
          setState(state, function(source, state) {
            if (!state.mathTextDepth && source.eatSpace()) return null;
            if (!state.mathTextDepth && source.peek() != "{") {
              setState(state, resume);
              return resume(source, state);
            }
            if (source.match(/^\\./)) return "tag";
            if (source.peek() == "%") { source.skipToEnd(); return "comment"; }
            var ch = source.next();
            if (ch == "{") state.mathTextDepth++;
            if (ch == "}" && --state.mathTextDepth == 0) setState(state, resume);
            if (ch == "{" || ch == "}") return "bracket";
            source.eatWhile(/[^{}\\%]/);
            return null;
          });
          return "tag";
        }
        return greek.test(command) ? "math" : "operator";
      }
      if (source.match(/^[a-zA-Z]+/)) {
        return "math";
      }
      // escape characters
      if (source.match(/^\\./)) {
        return "operator";
      }
      // special math-mode characters
      if (source.match(/^[\^_&]/)) {
        return "operator";
      }
      // non-special characters
      if (source.match(/^[+\-<>|=,\/@!*:;'"`~#?]/)) {
        return "operator";
      }
      if (source.match(/^(\d+\.\d*|\d*\.\d+|\d+)/)) {
        return "number";
      }
      var ch = source.next();
      if (ch == "{" || ch == "}" || ch == "[" || ch == "]" || ch == "(" || ch == ")") {
        return "operator";
      }

      if (ch == "%") {
        source.skipToEnd();
        return "comment";
      }
      return "error";
    }

    function beginParams(source, state) {
      var ch = source.peek(), lastPlug;
      if (ch == '{' || ch == '[') {
        lastPlug = peekCommand(state);
        lastPlug.openBracket(ch);
        source.eat(ch);
        setState(state, normal);
        return "bracket";
      }
      if (/[ \t\r]/.test(ch)) {
        source.eat(ch);
        return null;
      }
      setState(state, normal);
      popCommand(state);

      return normal(source, state);
    }

    return {
      startState: function() {
        var f = parserConfig.inMathMode ? function(source, state){ return inMathMode(source, state); } : normal;
        return {
          cmdState: [],
          mathReference: false,
          mathTextDepth: 0,
          f: f
        };
      },
      copyState: function(s) {
        return {
          cmdState: s.cmdState.slice(),
          mathReference: s.mathReference,
          mathTextDepth: s.mathTextDepth,
          f: s.f
        };
      },
      token: function(stream, state) {
        return state.f(stream, state);
      },
      blankLine: function(state) {
        state.f = normal;
        state.cmdState.length = 0;
      },
      lineComment: "%"
    };
  });

  CodeMirror.defineMIME("text/x-stex", "stex");
  CodeMirror.defineMIME("text/x-latex", "stex");

});
