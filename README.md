<p align="center">
    <img src="screenshots/Local%20Browser%20AI%20(0).png" alt="Local Browser AI icon" width="100%">
</p>

<p align="center">
    <a href="https://github.com/alexewerlof/local-browser-ai/stargazers"><img src="https://img.shields.io/github/stars/alexewerlof/local-browser-ai?style=social" alt="GitHub Stars"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
    <a href="https://chromewebstore.google.com/detail/pdpikolagglmoahkmobpmloimhakkjmd"><img src="https://img.shields.io/chrome-web-store/v/pdpikolagglmoahkmobpmloimhakkjmd?logo=google-chrome&logoColor=white" alt="Chrome Web Store"></a>
</p>

# Local Browser AI

This is the source code for [Local Browser AI](https://chromewebstore.google.com/detail/pdpikolagglmoahkmobpmloimhakkjmd).

👉 [Read the announcement](https://blog.alexewerlof.com/p/local-browser-ai).

## Hardware requirements

- A graphic card with at least 4GB VRAM.
- Windows, Linux, Mac, or Chrome OS.
- At least 20GB storage and a good enough internet.
- [See the full requirements](https://developer.chrome.com/docs/ai/prompt-api#hardware-requirements).

## Checking Availability

`LanguageModel.availability()` returns any of the following:

* `"available"`: Great news! The model is already on the device and ready for use. You can proceed to create a session with `LanguageModel.create()` and start prompting without any download. Your UI should reflect this ready state (e.g., by enabling the prompt input and hiding any download buttons).

* `"downloadable"`: The model is not on the device, but it's compatible and can be downloaded. This is your cue to offer the user a way to start the download. Calling `LanguageModel.create()` will automatically trigger the download process. You should show progress to the user.

* `"downloading"`: A download is already in progress. This could have been initiated by another tab or a previous action. You can call `LanguageModel.create()` again; the API is smart enough to hook into the ongoing download, allowing you to monitor its progress without starting a new one.

* `"unavailable"`: The model cannot be run on the current device. This could be due to hardware limitations or other constraints. You should inform the user and disable any features that rely on the model.

## Install

- You can install the production version via [Chrome Web Store](https://chromewebstore.google.com/detail/pdpikolagglmoahkmobpmloimhakkjmd).
- For development, head over to [chrome://extensions/](chrome://extensions/) and click **Load unpacked** to wherever you have cloned this repo. It should work out of the box.

## Build

We lightly use esbuild for absolute minimum (packaging).

```shell
npm run build
```

## Tests

We use the Node.js native testing framework.

```shell
npm test
```

## References

- [Intro](https://blog.alexewerlof.com/p/local-browser-ai)
- [Install from Chrome Web Store](https://chromewebstore.google.com/detail/pdpikolagglmoahkmobpmloimhakkjmd).
- [Install from Edge Add-on Store](https://microsoftedge.microsoft.com/addons/detail/becnhbaccnhaalnanlhjjboijablgjgj)
- [Prompt API proposal](https://github.com/webmachinelearning/prompt-api/blob/main/README.md)
- [Chrome Developer Docs for extensions: Prompt API](https://developer.chrome.com/docs/extensions/ai/prompt-api)
- [Chrome Developer Docs: Prompt API](https://developer.chrome.com/docs/ai/prompt-api)

---

<p align="center">
    <img src="images/swedish-flag.svg" alt="Swedish Flag" style="height: 1em; vertical-align: middle;"/>
    Made in Sweden by <a href="https://alexewerlof.com">Alex Ewerlöf</a>
    <br>
    <img src="images/logo.png" alt="logo" width="128">
</p>