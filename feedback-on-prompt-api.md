This is my wish list for the new Prompt API having built a simple chat application with it:

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
