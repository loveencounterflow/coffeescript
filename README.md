<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Changes](#changes)
- [RFCs](#rfcs)
  - [Macchiato: Coffe Plus Macros](#macchiato-coffe-plus-macros)
  - [(Extended?) LightScript Tilde Calls](#extended-lightscript-tilde-calls)
- [Installation](#installation)
- [Getting Started](#getting-started)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->



## Changes

* allow `v` flag in RegExp literals


## RFCs

### Macchiato: Coffe Plus Macros

* must be detectable using regular expressions
  * meaning that regex is tolerated to apply in comments and strings, so matcher should be reasonably exotic
* `.macchiato` file will be translated to `.coffee` by applying transforms defined by dependency
  * meaning that while Macchito will be unavoidably obscure (until we gain world domination that is), its
    definition and applications are contained locally (not the case for CoffeeScript itself which is deemed
    sufficiently popular—although maybe this isn't even true anymore!)
* Example: using tags to implement custom regex syntax

```

      { regex } = internals.slevithan_regex
      # debug 'Ωilxt_596', 4 %%% 5
      debug 'Ωilxt_597', rx_re = regex"\b(?<fn>[a-z_]+)\/(?<spec>(\/|[^\/])*)\/"
      debug 'Ωilxt_598', { ( ( "d = rx/(?>x)/".match rx_re )?.groups ? {} )..., }
      debug 'Ωilxt_599', /^error(_.*)?|(.*_)?error$/

```

### (Extended?) LightScript Tilde Calls

[LightScript Tilde Calls](https://www.lightscript.org/docs/#tilde-calls)

> [are] a headline feature of LightScript, and a slightly unique mix of Kotlin's Extensions Methods, Ruby's
> Monkey Patching, and Elixir's Pipelines.
>
> subject\~verb(object)
> verb(subject, object);
>
> The underlying goal is to encourage the functional style of separating immutable typed records from the
> functions that go with them, while preserving the human-readability of "subject.verb(object)" syntax that
> Object-Oriented methods provide.

**Proposal**: use `~` (`U+007e Tilde`) to mark 'delayed function loci':

* `a ~neg`        -> `neg a`
* `a ~mul b`      -> `mul a, b`
* `a ~sum b, c`   -> `sum a, b, c`

**Crazy Idea**: use `~` to enable mentioning of *anything* *anywhere*, will be moved to front, so

* `~sum a, b, c, d` -> `sum a, b, c, d`
* `a  ~sum b, c, d` -> `sum a, b, c, d`
* `a, b  ~sum c, d` -> `sum a, b, c, d`
* `a, b, c  ~sum d` -> `sum a, b, c, d`
* `a, b, c, d ~sum` -> `sum a, b, c, d`

**Ambiguities**: maybe required parentheses where more than one tilde call in expression / comma-operator
construct?

* `a, b ~mul c`
  * ❓ `mul a, b, c`
  * ❓ `a, mul b, c`
* `a ~mul b ~add c`
  * ❓ `mul a, add b, c` (???)
  * ❓ `add mul a, b, c` (???)
  * ✅ require `( a ~mul b ) ~add c` or `a ~mul ( b ~add c )`

**Syntax**:

* spaces between left-hand side and tilde:
  * ❌ allow `a~b()`
  * ✅ rule out `a ~ b()`
  * ✅ rule out `a~ b()`
  * ✅ require `a ~b()`
* spaces between tilde and right-hand side:
  * ❌ allow `a~ b()`
  * ❌ allow `a ~ b()`
  * ✅ rule out `a ~ b()`
  * ✅ rule out `a~ b()`
  * ✅ require `a ~b()`


------------------------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------------------------

**Original README.md below**

------------------------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------------------------




```
      @@@@@@@                @@@@  @@@@@
     @@@@@@@@@@              @@@   @@@                                           {
    @@@@     @@              @@@   @@@                                        }   }   {
   @@@@          @@@@@@@    @@@   @@@     @@@@@@    @@@@@@                   {   {  }  }
  @@@@          @@@   @@  @@@@@  @@@@@@  @@@   @@  @@@@  @@                   }   }{  {
  @@@@         @@@@   @@   @@@    @@@   @@@   @@@ @@@   @@@                  {  }{  }  }
  @@@@        @@@@    @@   @@@    @@@   @@@@@@@@  @@@@@@@@                  { }{ }{  { }
  @@@@@       @@@@   @@    @@@    @@@   @@@       @@@                     {  { } { } { }  }
   @@@@@@@@@@ @@@@@@@@    @@@    @@@    @@@@@@@@  @@@@@@@@                 { }   { }   { }
      @@@@@               @@@    @@@      @@@@@     @@@@@           @@@@@@   { }   { }    @@@@@@@
                         @@@    @@@                                 @@@@@@@@@@@@@@@@@@@@@@@@@@@@
      @@@@@@            @@@    @@@                                @@ @@@@@@@@@@@@@@@@@@@@@@@@@@
   @@@@    @@          @@@   @@@@                                @@   @@@@@@@@@@@@@@@@@@@@@@@@
   @@@@   @@@                       @@                  @@@@     @@@   @@@@@@@@@@@@@@@@@@@@@
   @@@@@          @@@@@   @@  @@   @@@     @@@@@@@     @@@@@      @@@    @@@@@@@@@@@@@@@@@@
     @@@@@      @@@  @@@ @@@@@@@@         @@@@  @@@@  @@@@@@@       @@@   @@@@@@@@@@@@@@@@
       @@@@@   @@@       @@@@     @@@@    @@@    @@@   @@@                 @@@@@@@@@@@@@@
 @@@@@  @@@@  @@@@      @@@@      @@@@   @@@@   @@@@  @@@@
@@@     @@@@  @@@       @@@@     @@@@    @@@    @@@@  @@@@
@@@     @@@@  @@@@     @@@@      @@@@   @@@@   @@@@  @@@@
 @@@@@@@@@     @@@@@@  @@@@       @@@@  @@@@@@@@@    @@@@
                                       @@@          @@@@
                                      @@@
                                      @@@
```

CoffeeScript is a little language that compiles into JavaScript.

## Installation

Once you have Node.js installed:

```shell
# Install locally for a project:
npm install --save-dev coffeescript

# Install globally to execute .coffee files anywhere:
npm install --global coffeescript
```

## Getting Started

Execute a script:

```shell
coffee /path/to/script.coffee
```

Compile a script:

```shell
coffee -c /path/to/script.coffee
```

For documentation, usage, and examples, see: https://coffeescript.org/

To suggest a feature or report a bug: https://github.com/jashkenas/coffeescript/issues

If you’d like to chat, drop by #coffeescript on Freenode IRC.

The source repository: https://github.com/jashkenas/coffeescript.git

Changelog: https://coffeescript.org/#changelog

Our lovely and talented contributors are listed here: https://github.com/jashkenas/coffeescript/contributors
