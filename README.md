# Hardware requirements

- A graphic card with at least 4GB VRAM.
- Windows, Linux, Mac.
- At least 20GB storage and a good enough internet.
- [See the full requirements](https://developer.chrome.com/docs/ai/prompt-api#hardware-requirements).

# Checking Availability

`LanguageModel.availability()` returns any of the following:

* `"available"`: Great news! The model is already on the device and ready for use. You can proceed to create a session with `LanguageModel.create()` and start prompting without any download. Your UI should reflect this ready state (e.g., by enabling the prompt input and hiding any download buttons).

* `"downloadable"`: The model is not on the device, but it's compatible and can be downloaded. This is your cue to offer the user a way to start the download. Calling `LanguageModel.create()` will automatically trigger the download process. You should show progress to the user.

* `"downloading"`: A download is already in progress. This could have been initiated by another tab or a previous action. You can call `LanguageModel.create()` again; the API is smart enough to hook into the ongoing download, allowing you to monitor its progress without starting a new one.

* `"unavailable"`: The model cannot be run on the current device. This could be due to hardware limitations or other constraints. You should inform the user and disable any features that rely on the model.

# Tests

We use the Node.js native testing framework.

```shell
node --test
```

# References

[Prompt API proposal](https://github.com/webmachinelearning/prompt-api/blob/main/README.md)
[Chrome Developer Docs for extensions: Prompt API](https://developer.chrome.com/docs/extensions/ai/prompt-api)
[Chrome Developer Docs: Prompt API](https://developer.chrome.com/docs/ai/prompt-api)