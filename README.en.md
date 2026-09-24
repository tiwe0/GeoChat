<p align="center">
  <img src="build/icon.png" width="96" alt="GeoChat Desktop logo">
</p>

<h1 align="center">GeoChat Desktop</h1>

<p align="center">
  AI conversation, drawing, and explanation—directly on the GeoGebra canvas.
</p>

<p align="center">
  <a href="README.md">简体中文</a>
  ·
  <a href="https://chat-with-geogebra.com">Website</a>
  ·
  <a href="https://github.com/tiwe0/GeoChat/releases/latest">Download GeoChat</a>
  ·
  <a href="#highlights">Highlights</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/tiwe0/GeoChat"></a>
  <a href="https://github.com/tiwe0/GeoChat/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/tiwe0/GeoChat?style=social"></a>
  <img alt="macOS" src="https://img.shields.io/badge/macOS-supported-black">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-supported-0078D4">
</p>

`v0.6.0` · The new Fusion Mode is enabled by default

## Meet GeoChat

GeoChat is an AI GeoGebra assistant for learning, teaching, and exploring mathematics.

Describe a problem, a figure, or a construction goal. GeoChat understands the current canvas,
builds and verifies the construction, and presents the important relationships and solution steps
next to the geometry itself. Conversation becomes part of the canvas instead of a separate window.

## Preview

### Fusion Mode

<img src="docs/media/geochat-fusion-mode.png" alt="GeoChat v0.6.0 Fusion Mode with conversation, tool progress, and a composer placed directly on the GeoGebra canvas">

Summon the composer anywhere on the canvas. Each response stays close to the construction it belongs
to, while older turns gradually fade to preserve context without covering your work.

### Window Mode

<img src="docs/media/geochat-desktop-zh.png" alt="GeoChat Desktop in Window Mode">

Prefer a familiar chat layout? Switch back to Window Mode at any time without losing the current
conversation, canvas, or open workspace features.

### Demo Video

<video src="https://raw.githubusercontent.com/tiwe0/GeoChat/master/docs/media/geochat-desktop-demo-1080p.mp4" controls width="100%"></video>

[Open the demo video if playback is unavailable](docs/media/geochat-desktop-demo-1080p.mp4)

## Highlights

### Ask the canvas directly

GeoChat can read the current construction and selected objects. Ask it to move a line through point A,
explain why an intersection exists, or clean up the current figure without describing the whole scene again.

### Draw 2D and 3D mathematics with natural language

Create anything from functions and plane geometry to solid geometry. GeoChat plans the construction,
operates GeoGebra, checks the result, and then explains what happened.

### Keep conversation spatially connected to geometry

In Fusion Mode, the composer can be dragged or summoned at a chosen position. Each answer stays near
its turn and can be collapsed, pinned, dismissed, or continued from the same location.

### See reasoning and tool progress without raw logs

Compact process cards show whether GeoChat is reading the canvas, constructing objects, or verifying
the result. You get useful progress without pages of implementation details.

### Read answers designed for teaching

Solution steps, teaching hints, animation guides, choice analysis, and selected objects appear as
purpose-built cards. Mathematical notation is rendered with LaTeX.

### Explore the built-in problem library

Browse problems and solutions without leaving the canvas, and download collections only when needed.
Any problem can become the starting point for a new visual explanation.

### Match mathematical skills automatically

GeoChat selects relevant mathematics and GeoGebra skills for each problem. You can choose which skills
are enabled and set your preferred visualization style.

### Choose your model or connect your own service

Use DeepSeek, OpenAI, Anthropic Claude, Google Gemini, OpenRouter, or Qwen. You can also add custom
models through OpenAI-compatible, Anthropic, or Google protocols.

### Work in Chinese or English

The interface supports Chinese and English and can be switched while you work.

## Using Fusion Mode

1. Press `⌘K` on macOS or `Ctrl+K` on Windows to summon the composer near your latest position.
2. Enter a problem, construction request, or question about the current figure.
3. Drag the composer, or use the positioning button to place the next turn where it belongs.
4. Collapse, pin, dismiss, or continue a response from its original location.

The top toolbar keeps full conversation history, the blackboard, problem library, language settings,
and preferences close at hand. Window Mode is always one click away.

## Built for these workflows

| Scenario | What GeoChat helps you do |
| --- | --- |
| Learning mathematics | Turn abstract problems into visual, interactive explanations. |
| Teaching | Create constructions, animations, and structured explanations quickly. |
| Exploring geometry | Change conditions, move objects, compare constructions, and observe results. |
| Solving problems | Start from the library or your own question, then derive and verify visually. |
| Using GeoGebra | Access everyday and advanced capabilities through natural language. |

## Download and Get Started

1. Visit the [GeoChat website](https://chat-with-geogebra.com) or
   [GitHub Releases](https://github.com/tiwe0/GeoChat/releases/latest).
2. Download and install the macOS or Windows edition.
3. Add the API key for your preferred model provider in Settings.
4. Return to the canvas and enter a problem or construction request.

GeoChat uses a bring-your-own-key model. Model usage is billed by the provider you choose according
to that provider's pricing.

## Local First

The core desktop experience does not require an online GeoChat account. Model credentials,
conversation history, problem-library cache, and preferences are managed on your device. Data is sent
to an external service only when you request a model response or intentionally load online content.

## Open Source and Acknowledgements

GeoChat-owned source code and documentation are available under the
[Apache License 2.0](LICENSE). Third-party components remain under their respective licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for details.

Thank you to GeoGebra for its powerful mathematics platform, and to every contributor, tester, and supporter.

## Help Improve GeoChat

Questions and suggestions are welcome in [GitHub Issues](https://github.com/tiwe0/GeoChat/issues).
Please never include API keys or other sensitive information in issues, logs, or screenshots.

## Star History

If GeoChat is useful to you, consider giving the project a Star.

[![Star History Chart](https://api.star-history.com/chart?repos=tiwe0/GeoChat&type=date&legend=top-left&sealed_token=oLgvpSYDuR0sPwlHMJv5pUNWFalPacI6ExWrttKg2zYQ9hin9c-CxY9b18RI0rfy97R4_bA4Z56afgMTJ9_-k_p_MoBqB6A3-mU4YUchikyRgRfD7JJO4mX6tqwCINW-sm4HPupk3C0Ku5H0vRNrOhbombQb7PDykT-gzkXxFPKRf6zBljrBAfOEEL3V)](https://www.star-history.com/?type=date&repos=tiwe0%2FGeoChat)
