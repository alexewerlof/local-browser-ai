import { createServer } from 'node:http'

/**
 * A small OpenAI-compatible server for the browser harness.
 *
 * It streams SSE chunks and records every request body, so scenarios can assert on the
 * exact payload the app produced (system prompt, history, tools, stream_options).
 */
export function startFakeModelServer(options = {}) {
	const {
		chunks = ['Hello', ' from', ' the', ' local', ' server', '.'],
		delayMs = 10,
		models = ['fake-model', 'llama-3.2-3b-instruct'],
		/** Optional: (body, callIndex) => 'tool-call' | 'text' */
		toolScript = null,
		toolCall = {
			name: 'find_in_page',
			arguments: JSON.stringify({ query: 'pricing' }),
		},
		usage = true,
	} = options

	const requests = []
	let callIndex = 0

	const cors = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Headers': '*',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	}

	function sendJson(response, status, body) {
		response.writeHead(status, { ...cors, 'Content-Type': 'application/json' })
		response.end(JSON.stringify(body))
	}

	function sse(response, payload) {
		response.write(`data: ${JSON.stringify(payload)}\n\n`)
	}

	function toolCallChunk() {
		return {
			id: 'chatcmpl-1',
			object: 'chat.completion.chunk',
			model: 'fake-model',
			choices: [
				{
					index: 0,
					delta: {
						role: 'assistant',
						tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: toolCall }],
					},
					finish_reason: null,
				},
			],
		}
	}

	function textChunk(text, finishReason = null) {
		return {
			id: 'chatcmpl-1',
			object: 'chat.completion.chunk',
			model: 'fake-model',
			choices: [{ index: 0, delta: { content: text }, finish_reason: finishReason }],
		}
	}

	const server = createServer((request, response) => {
		if (request.method === 'OPTIONS') {
			response.writeHead(204, cors)
			response.end()
			return
		}

		if (request.method === 'GET' && request.url?.endsWith('/models')) {
			sendJson(response, 200, { object: 'list', data: models.map((id) => ({ id, object: 'model' })) })
			return
		}

		if (request.method === 'POST' && request.url?.endsWith('/chat/completions')) {
			let raw = ''
			request.on('data', (chunk) => {
				raw += chunk
			})
			request.on('end', async () => {
				let body
				try {
					body = JSON.parse(raw)
				} catch {
					sendJson(response, 400, { error: { message: 'Invalid JSON' } })
					return
				}
				requests.push(body)
				const index = callIndex++
				const wantsTool = toolScript ? toolScript(body, index) === 'tool-call' : false

				if (!body.stream) {
					if (wantsTool) {
						sendJson(response, 200, {
							id: 'chatcmpl-1',
							object: 'chat.completion',
							model: body.model ?? 'fake-model',
							choices: [
								{
									index: 0,
									message: {
										role: 'assistant',
										content: null,
										tool_calls: [{ id: 'call_1', type: 'function', function: toolCall }],
									},
									finish_reason: 'tool_calls',
								},
							],
						})
						return
					}
					sendJson(response, 200, {
						id: 'chatcmpl-1',
						object: 'chat.completion',
						model: body.model ?? 'fake-model',
						choices: [
							{
								index: 0,
								message: { role: 'assistant', content: chunks.join('') },
								finish_reason: 'stop',
							},
						],
						...(usage ? { usage: { prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 } } : {}),
					})
					return
				}

				response.writeHead(200, {
					...cors,
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					Connection: 'keep-alive',
				})

				const pause = () => new Promise((resolve) => setTimeout(resolve, delayMs))
				const write = async (payload) => {
					sse(response, payload)
					await pause()
				}

				if (wantsTool) {
					sse(response, textChunk(''))
					await write(toolCallChunk())
					sse(response, {
						id: 'chatcmpl-1',
						object: 'chat.completion.chunk',
						choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
					})
					if (usage) {
						sse(response, {
							id: 'chatcmpl-1',
							object: 'chat.completion.chunk',
							choices: [],
							usage: { prompt_tokens: 60, completion_tokens: 12, total_tokens: 72 },
						})
					}
					response.write('data: [DONE]\n\n')
					response.end()
					return
				}

				sse(response, textChunk(''))
				for (const chunk of chunks) {
					await write(textChunk(chunk))
				}
				sse(response, {
					id: 'chatcmpl-1',
					object: 'chat.completion.chunk',
					choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
				})
				if (usage) {
					sse(response, {
						id: 'chatcmpl-1',
						object: 'chat.completion.chunk',
						choices: [],
						usage: { prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 },
					})
				}
				response.write('data: [DONE]\n\n')
				response.end()
			})
			return
		}

		sendJson(response, 404, { error: { message: 'Not found' } })
	})

	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			const url = `http://127.0.0.1:${address.port}`
			resolve({
				url,
				endpoint: `${url}/v1`,
				requests,
				close: () =>
					new Promise((done) => {
						server.close(() => done())
					}),
			})
		})
	})
}
