I've tested this extension on Linux, Mac, Windows, and Chrome OS.

This is my wish list for the new Prompt API having built a simple chat application with it:

# The context window is extremely limited

On an NVIDIA RTX 4070 Super with 12GB memory, I only get about 9K. This is drastically smaller than what this same
hardware can give with LLaMA.cpp (up to 130K using LM Studio).

One thing that I really wish to see is some sort of smart RAG behind the scene which hides the complexity from the
developer. So I just dump information into the API and it's smart enough to know which information to add to the context
based on query.

Regardless, increasing the context window makes an extension like this super useful because the user can use language
models with larger pages. Currently I "compress" the page HTML by converting it to Markdown format which is both more
efficient and "native" to language models, but even then, the majority of the pages I tried don't work too well with
this extension, unless some selection snippets are sent to the [small] context.

# Granular events for model download and loading to GPU

`LanguageMode.create()` emits monitor events both when downloading a model or loading it to GPU. The former emits many
events but the latter just emits 0% and 100% events.

One can guess which one is which based on the result of `LanguageModel?.availability(modelOptions)` but it'd lead to
cleaner code if the two sets of events were separated.

# `LanguageMode.create()` halts.

If there was a problem with downloading the model, `await LanguageModel.create()` blocks indefinitely.

- No exceptions are thrown
- The monitor event is not fired even once

This is not due to lack of space or poor internet connection. When the model is downloading, if the user closes the
extension side panel (which initializes the download), it happens. Considering that model download take a while it's
safe to assume that the user may want to close the side panel to do other stuff while "it's downloading".

Another occasion is when the user clicks "Stop" button essentially firing an abort signal that was passed to
LanguageModel.create().

Worst of all, restarting the extension doesn't help. Other things I tried:

- Turning the extension [on and off](https://support.google.com/chrome_webstore/answer/2664769)
- Reinstalling the extension
- Disabling all "Gemini Nano" flags in `chrome://flag` and enabling them
- Checking `chrome://download-internals/` (it says "Model" but I'm not sure it's referring to language model)
- Checking `chrome://on-device-internals` says "Install Not Complete" (can we have a "Retry" button here?)
- Checking `chrome://local-state`, `chrome://system` or `chrome://system` didn't give me a clue with further info.

Chrome seems to be in an unstable state on that machine. Sometimes deleting data via helps but I haven't figured out a
pattern yet.

Sometimes going to `chrome://settings/clearBrowserData` > Advanced, picking "All Time" and deleting everything
(including "Hosted app data") helps on some computers but I couldn't find a pattern.

# A mechanism to get the list of supported languages

Currently only 'en', 'es', 'jp' is supported from the examples. But even this list cannot be obtained from some API. I
tried "hacking" it by brute-force-testing all language codes but didn't succeed beyond those 3.

If I ask it what languages, it can speak, it lists French, German, Chinese, Korean, Portuguese, Italian, Russian, "and
many more".

In my tests, it can also translate decently to Swedish without that language being listed.

How about just skipping this setting altogether? A language model isn't usually limited to one language anyway.

# Actually support the supported languages

When initializing the LanguageModel, one can specify different language codes for:

- System prompt
- User prompt
- Assistant response

My UI has selectors for all these languages but it doesn't seem to have any effect on the output.

# Allow modifying `temperature` and `topK` after initialization

Currently, the only way to achieve this is to create a new session.

# Allow modifying the messages in `session`

Currently, the only way to achieve this is to clone a session and "manually" append messages from a separately
maintained parallel state cache. This allows editing user prompt (like gemini) or regenerating a response if the user
isn't happy with the response.

# Allow setting `maxTokens`

Most other LLM tools have this setting. It allows more fine grained control over the expected output which may have
implications for the UI design (e.g. how much space there is). Summarization API accepts a `length` parameter but it's
only limited to pre-defined and application strings like `tldr`, `teaser`, etc.

# Provide a way to delete the downloaded model via [chrome://on-device-internals/](chrome://on-device-internals/)

I tried deleting the model files but it left Chrome in unstable state where it was confused whether it should download
the model or not, and download functionality halted.

# Provide a way to do function calls in a safe manner

Using an isolated environment to execute SLM-generated code is an option. Currently, it hard to implement any sort of
agentic workflow without tool or MCP support.

# Consolidate all LLM use cases to one API

There are currently too many APIs: Writing, Rewriting, Scam detection, etc. I believe it's the wrong abstraction level.
Generally the browser provides the basic constructs providing a flexible absolute necessary functionality and leave the
application-level abstractions to user code and libraries. I think a solid Prompt API similar to the Chat Completion
endpoint is enough at this point.

# Monitor is weird

It expects an object that has a member that will create a function that will be called as the download progresses. Why
can't this be just a normal idiomatic event like most other browser APIs?

# It is not clear how the session works when appending something larger than context window

Dumping a large message emits the quota error. However, breaking that large message and gradually appending it to the
session works. But does it mean that the session "forgets" earlier messages? (as in shifting-window algorithm) Or does
it keep the key information and essentially compresses itself? I hope for the latter but the behavior is not documented
even though it's very important due to such a small context window.

# The ability to load custom model files

If Chrome can run models, it'll be a huge benefit to be able to load other models pretty much like how the browser
supports loading our own web assembly program. Currently, there are a few libs that allow running custom models in the
browser, but nothing beats native browser support and it seems Chrome has solved this problem already, so why not?
