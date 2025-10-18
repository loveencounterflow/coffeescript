<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Changes](#changes)
- [RFCs](#rfcs)
  - [Three Simple Things](#three-simple-things)
  - [Better Un-Implicit Returns](#better-un-implicit-returns)
    - [Solutions that Already Work](#solutions-that-already-work)
  - [Macchiato: Coffe Plus Macros](#macchiato-coffe-plus-macros)
  - [(Extended?) LightScript Tilde Calls](#extended-lightscript-tilde-calls)
  - [Tagged Comments for Conditional Execution](#tagged-comments-for-conditional-execution)
  - [Annotations to Obtain Sync and Async Methods from One Source](#annotations-to-obtain-sync-and-async-methods-from-one-source)
- [Installation](#installation)
- [Getting Started](#getting-started)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->



## Changes

* allow `v` flag in RegExp literals


## RFCs

### Three Simple Things

https://www.reddit.com/r/ProgrammingLanguages/comments/1n41akt/comment/nbz5ovq/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button:

> At the peril of adding even more bloat to this already long thread, I'd like to offer my Modest Proposal
> For a Not-Too Shabby Language:
>
> * You don't get macros, hygienic or otherwise.
>
> * But you do get three things (on top of a language like Python or JavaScript so we're on common ground):
>
> * **deferred evaluation** of function arguments, probably only where marked as such; writing `f(g())` will
>   always mean 'call `g()`, then pass the result to `f()`', but `h!(g())` with an `!` means 'call `h!()`
>   with the AST (whatever) of its arguments and let it decide what to do with them. (You can't call `f!()`
>   and you can't call `h()` unless these are defined; `f()` and `f!()` are two independent things.)
>
> * **user-defined operators**, or rather **pre-, in- and postfix function calls**. Prefix means that
>   instead of `f(g())`, one can write `f g()`. This is a simple yet effective way to eliminate many, many
>   gratuitous parentheses. Infix means one can write (say) `a ~equals~ b` as an equivalent to `equals a, b`
>   and, hence, `equals(a,b)`. Postfix means one can write `g() ~f` for `f(g)`. This is arguably the same as
>   piping so maybe should be written `g() | f`.
>
> * **Tagged literal calls** similar to JavaScripts [Tagged
>   Templates](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates)
>   but generalized to tacked-on prefixes like `f"bar"`, `s[1,2,3,]`, `t{a:1,}` which are just sugared
>   function calls with arbitrary user-defined return values. Especially using tagged string literals is a
>   powerful thing; personally I use it for example in CoffeeScript/JavaScript to just mark my SQL
>   statements (as in `for row from db.query SQL"select * from t;"`) which is picked up by my customized
>   syntax definition for Sublime Text; I find this gives me like 90% of the benefits of embedding SQL in my
>   programming language but without the complexities. Another use case is Pythonesque f-strings, ex. `f"
>   #{sku}:<9c; #{price}:>10.2f; "`; yet another is using custom optimized syntax for initializing
>   ('serializing') arbitrary objects.
>
> I believe these Three Simple Things are almost everything you'd want from a macro facility, but, to make a
> bold claim, without *any* of the downsides.

* **Deferred Evaluation** (DEFEV)
* **User-Defined Operators** (UDOPs), (**Pre-, In- and Postfix Function Calls**)
* **Tagged Literals** (tLits) [tillits]


### Better Un-Implicit Returns

CoffeeScript's implicit returns mean


* introduce a **(Return) Guard**, maybe as `./.`, to replace `return null` (and indicate 'this function does
  not return a useful value', as opposed to 'intentionally returning `null`'):

  ```coffee
  f = ( a ) -> ./.
  ```

* introduce **Explicit Opt-In Forms** `f = ( a, b ) <-> ...`, `f = ( a, b ) <=> ...` for
  functions that *should* use implicit return exactly as all functions do now

* introduce **Explicit Opt-Out Forms** `f = ( a, b ) /-> ...`, `f = ( a, b ) /=> ...` that implicitly add a
  terminating `null` expression (or a `return null` statement) to their source before compiling to JS.
  Compare how at present, `-> yield d for d from e` compiles to

  ```js
  (function*() {
    var d, results;
    results = [];
    for (d of e) {
      results.push((yield d));
    }
    return results;
  });
  ```

  while `-> yield d for d from e; null` and `-> yield d for d from e; return null` compile to

  ```js
  (function*() {
    var d;
    for (d of e) {
      yield d;
    }
    return null;
  });
  ```

  which is most often what one wants. With Explicit Opt-Out, the latter could be written as `/-> yield d for
  d from e`. Syntactic variants like

  * `f = ( a, b ) -/->`, `f = ( a, b ) =/=>`
  * `f = ( a, b ) ->>`, `f = ( a, b ) =>>` (`->>` is *much* easier to type than `-/->`)

  should be considered.

#### Solutions that Already Work

The below solutions (1) thru (3) behave identically, demonstrating that just adding semicolons doesn't
suffice to trick the CS compiler to drp an implicit return. Because there's a loop, an `Array` is
constructed, populated and returned, only to be garbage-collected or leaking implementation details—that's
five bad things for the price of one:

```coffee
# these return an array with the iteration results:

f = -> d[ i ] = x for x, i in mylist          # (1)
f = -> d[ i ] = x for x, i in mylist ;        # (2)
f = -> d[ i ] = x for x, i in mylist ;;;;     # (3)
```

Solutions (4) thru (7) demonstrate a simple cop-out that's also 'graphically' appealing, so to speak. I
especially like number (5) `-> whatever 'dontcare' ;___` and suspect that this idiom might be good enough to
make fumbling with the CS tokenizer look like hardly worth the while:

```coffee
# these return `null`:

_   = null
___ = null
N   = null

f = -> d[ i ] = x for x, i in mylist ;_       # (4)

f = -> d[ i ] = x for x, i in mylist ;___     # (5)

f = -> d[ i ] = x for x, i in mylist ;N       # (6)

f = -> d[ i ] = x for x, i in mylist ;null    # (7)
```

**Update**—turns out implicit returns have caused a susbtantial amount of discussion back in the day (see for example
[CoffeeScript#4210](https://github.com/jashkenas/coffeescript/issues/4210),
[CoffeeScript#2477](https://github.com/jashkenas/coffeescript/issues/2477),
[StackOverflow #7391493](http://stackoverflow.com/questions/7391493/is-there-any-way-to-not-return-something-using-coffeescript),
[StackOverflow #15469580](http://stackoverflow.com/questions/15469580/how-to-avoid-an-implicit-return-in-coffeescript-in-conditional-expressions),
[StackOverflow #16882116](http://stackoverflow.com/questions/16882116/coffeescript-how-to-avoid-unnecessary-returns),
[StackOverflow #14177751](http://stackoverflow.com/questions/14177751/how-to-avoid-this-return-in-nested-coffeescript),
[*Why I hate implicit return in CoffeeScript*](http://programmaticallyspeaking.com/why-i-hate-implicit-return-in-coffeescript.html),
[*jQuery and CoffeeScript: trouble with automatic return*](https://coderwall.com/p/-vdm8q),
[*While I love CoffeeScript, the always-implicit-return thing is my biggest pet peeve*](https://news.ycombinator.com/item?id=5389245));
in that light, were it not for backward compatibility, an opt-in for implicit return seems indeed advisable,
with a lightweight syntax for opt-out appearing as the next best solution.

* `-/>` has been [proposed as opt-out syntax](https://news.ycombinator.com/item?id=5389245)
* `^value` has been [proposed as a shorter form of `return value`](https://news.ycombinator.com/item?id=5393220)
* a new keyword like `stop` or `finish` [has been proposed](https://stackoverflow.com/a/24862881/7568091) to
  block implicit return. (Turns out that a keyword is not strictly needed; just setting `finish = undefined`
  or `over = null` or something like that would be enough to get the desired effect.)

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

**Alternative**:

* all applications of `~` *must* have a single argument to the left and *may* have a single argument to the
  right
* tilde operator expression can appear within comma operator lists, function calls without it 'crossing the
  lines' as set by commas, so `f a, b ~mul c, d` -> CS `f a, ( mul b, c ), d`; this would make tilde call
  expressions more like operators
  * in fact maybe call them 'tilde *operators*'
* despense with parens as in `a ~neg` -> CS `neg a` -> JS `neg( a )`?

### Tagged Comments for Conditional Execution

* line comments of the form `/#:tag\s+(?<tagged_code>.*)$/`
* block comments of the form `/###:tag\s+(?<tagged_code>.*)###$/s`
* will be included in the code when a command-line flag or an in-file setting marks the tag for execution

### Annotations to Obtain Sync and Async Methods from One Source

In
[JetStreams](https://github.com/loveencounterflow/bricabrac-sfmodules/blob/4a199b34744c0f19a1e349c35c07400ecb316f60/src/jetstream.brics.coffee#L193-L218),
there is a need to have both synchronous and asynchronous versions of a number of methods to implement both
a synchronous `Jetstream` and an asynchronous `Async_jetstream` class. This is somewhat obnoxious and there
seemingly exists no very good way to do this than to write fully separate sync and async code for all
methods that have to deal with async calls. Of course that leads to a lot of code duplication like this:

```coffee
#=========================================================================================================
Jetstream::_pick = ( picker, P... ) ->
  ### NOTE this used to be the idiomatic formulation `R = [ ( @walk P... )..., ]`; for the sake of making
  sync and async versions maximally similar, rewritten as the sync version of `await Array.fromAsync @walk P...` ###
  R = Array.from @walk P...
  # <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< CODE DUPLICATION BELOW >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
  return R if picker is 'all'
  if R.length is 0
    throw new Error "no results" if @cfg.fallback is misfit
    return @cfg.fallback
  return R.at  0 if picker is 'first'
  return R.at -1 if picker is 'last'
  throw new Error "unknown picker #{picker}"

#---------------------------------------------------------------------------------------------------------
Async_jetstream::_pick = ( picker, P... ) ->
  ### NOTE best async equivalent to `[ ( @walk P... )..., ]` I could find ###
  ### NOTE my first solution was `R = ( d for await d from @walk P... )`, but that transpiles into quite a few lines of JS ###
  ### thx to https://allthingssmitty.com/2025/07/14/modern-async-iteration-in-javascript-with-array-fromasync/ ###
  R = await Array.fromAsync @walk P...
  # <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< CODE DUPLICATION BELOW >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
  return R if picker is 'all'
  if R.length is 0
    throw new Error "no results" if @cfg.fallback is misfit
    return @cfg.fallback
  return R.at  0 if picker is 'first'
  return R.at -1 if picker is 'last'
  throw new Error "unknown picker #{picker}"
```

To mitigate the effects, one could of course do some refactoring of the above code and put the duplicated
parts into a method that is shared by both versions of `pick()`, which is what I'm going to do next:

```coffee
Jetstream::_pick       = ( picker, P... ) -> R = @_pick_from_list picker,       Array.from      @walk P...
Async_jetstream::_pick = ( picker, P... ) -> R = @_pick_from_list picker, await Array.fromAsync @walk P...
```

In principle the question remains whether it's feasible and worthwhile to write such code once instead of
twice, especially if the only delta between the two versions is the presence vs the absence of `await` in
the right spots; in this example, it's hard to see how the code could benefit from refactoring in the way
the code sample from above did:

```coffee
  #=========================================================================================================
  Jetstream::_walk_all_to_exhaustion = ->
    if @is_empty  then  yield                             @shelf.shift() while @shelf.length > 0
    else                yield from       @transforms[ 0 ] @shelf.shift() while @shelf.length > 0
    #                              ▲▲▲▲▲
    ;null

  #---------------------------------------------------------------------------------------------------------
  Async_jetstream::_walk_all_to_exhaustion = ->
    if @is_empty  then  yield                             @shelf.shift() while @shelf.length > 0
    else                yield from await @transforms[ 0 ] @shelf.shift() while @shelf.length > 0
    #                              ▲▲▲▲▲
    ;null
```

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
