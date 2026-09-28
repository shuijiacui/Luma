import { chatText, chatWithImage, llmConfig } from './llmClient.js'
import { niloImageConfig } from './niloImageGenerator.js'

/** Keep scene routing independent from parent conversations and speech. */
export function niloSceneModelConfig(env = process.env) {
  const image = niloImageConfig(env)
  if (!image.enabled || env.NILO_SCENE_PROVIDER === 'default') return llmConfig(env)
  return { baseUrl: `${image.baseUrl}/compatible-mode/v1`, apiKey: image.apiKey,
    textModel: env.NILO_SCENE_TEXT_MODEL || 'qwen3.8-max', visionModel: env.NILO_SCENE_VISION_MODEL || 'qwen3.8-max',
    understandingModel: env.NILO_SCENE_UNDERSTANDING_MODEL || 'qwen3.7-flash',
    observationModel: env.NILO_SCENE_OBSERVATION_MODEL || 'qwen3.7-flash' }
}

export function sceneTextOptions(options = {}, config = niloSceneModelConfig()) {
  return { ...options, config,
    ...(options.kind === 'nilo_scene_understand' && config.understandingModel ? { model: config.understandingModel } : {}) }
}
export const sceneChatText = (prompt, options) => chatText(prompt, sceneTextOptions(options))
export function sceneVisionOptions(options = {}, config = niloSceneModelConfig()) {
  return { ...options, config,
    ...(options.kind === 'nilo_scene_observe' && config.observationModel ? { model: config.observationModel } : {}) }
}
export const sceneChatWithImage = (image, prompt, options) => chatWithImage(image, prompt, sceneVisionOptions(options))
