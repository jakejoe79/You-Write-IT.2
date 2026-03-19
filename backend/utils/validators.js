function validateGenerateRequest(body) {
  const { mode, input } = body;
  if (!mode) throw new Error('mode is required');
  if (!input) throw new Error('input is required');
  if (!['abridged', 'story', 'adventure'].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}`);
  }
}

module.exports = { validateGenerateRequest };
