[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/pdpikolagglmoahkmobpmloimhakkjmd?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/pdpikolagglmoahkmobpmloimhakkjmd)
[![Microsoft Edge Add-on](https://img.shields.io/microsoft-edge-add-on/v/becnhbaccnhaalnanlhjjboijablgjgj?logo=microsoft-edge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/becnhbaccnhaalnanlhjjboijablgjgj)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![logo](images/icon-128.png)

# Local Browser AI

This is the source code for [Local Browser AI](https://chromewebstore.google.com/detail/pdpikolagglmoahkmobpmloimhakkjmd).

👉 [Read the announcement **here**](https://blog.alexewerlof.com/p/local-browser-ai).

# Install

- [Chrome Web Store](https://chromewebstore.google.com/detail/local-browser-ai/pdpikolagglmoahkmobpmloimhakkjmd)
- [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/local-browser-ai/becnhbaccnhaalnanlhjjboijablgjgj)
- For development, head over to [chrome://extensions/](chrome://extensions/) and click **`Load unpacked`** and point to where you have cloned this repo.

## Hardware requirements

- A graphic card with at least 4GB VRAM.
- Windows, Linux, Mac, or Chrome OS.
- At least 20GB storage and a good enough internet.
- [See the full requirements](https://developer.chrome.com/docs/ai/prompt-api#hardware-requirements).

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

- [Prompt API proposal](https://github.com/webmachinelearning/prompt-api/blob/main/README.md)
- [Chrome Developer Docs for extensions: Prompt API](https://developer.chrome.com/docs/extensions/ai/prompt-api)
- [Chrome Developer Docs: Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- [Chrome Generative AI Privacy, Terms and Policy](https://policies.google.com/terms/generative-ai/use-policy)
- [Chrome: Built-in AI](https://developer.chrome.com/docs/ai/built-in)
- [Microsoft: Prompt API](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/prompt-api)

---
---
---

<p align="center">
    <img src="images/swedish-flag.svg" alt="Swedish Flag" style="height: 1em; vertical-align: middle;"/>
    Made in Sweden by <a href="https://alexewerlof.com">Alex Ewerlöf</a>
    <br>
    <img src="images/logo.png" alt="logo" width="128">
</p>