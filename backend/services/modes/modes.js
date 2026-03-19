// Mode registry — abridged / story / adventure
const abridged = require('./abridged');
const story = require('./story');
const adventure = require('./adventure');

const registry = new Map([
  ['abridged', abridged],
  ['story', story],
  ['adventure', adventure],
]);

function get(mode) {
  return registry.get(mode) || null;
}

module.exports = { get };
