// GPT revision of the Qianwen candidate after native DeepSeek's prototype finding.
// Only the explicit request option is normalized; omitted callers retain defaults.
export function deepThinkingOptions(value) {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('invalid_thinking_option');
  const keys = Reflect.ownKeys(value);
  const mode = Object.getOwnPropertyDescriptor(value, 'type')?.value;
  if (keys.length !== 1 || keys[0] !== 'type' || !['enabled', 'disabled'].includes(mode)) throw new TypeError('invalid_thinking_option');
  return {thinking: {type: mode}};
}
