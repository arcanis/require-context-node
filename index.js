const fs = require(`fs`);
const path = require(`path`);
const Module = require(`module`);
const {ResolverFactory} = require(`enhanced-resolve`);

const asyncModes = new Set([`lazy-once`, `lazy`, `async-weak`]);

const resolver = ResolverFactory.createResolver({
  useSyncFileSystemCalls: true,
	fileSystem: fs,
  resolveToContext: true,
});

const makeRequireContext = module => {
  return (request, recursive, filter, mode) => {
    const resolvedRoot = resolver.resolveSync({}, path.dirname(module.filename), request, {});
    const keys = new Set();

    function traverseDirectory(directory) {
      const listing = fs.readdirSync(path.join(resolvedRoot, directory), {
        withFileTypes: true,
      });

      for (const entry of listing) {
        const entryRelativePath = `${directory}/${entry.name}`;

        if (entry.isDirectory()) {
          if (recursive) {
            traverseDirectory(entryRelativePath);
          }
        } else {
          if (filter.test(entryRelativePath)) {
            keys.add(entryRelativePath);
          }
        }
      }
    }

    traverseDirectory(`.`);

    const requireContextEntry = key => {
      if (!keys.has(key))
        throw new Error(`Missing key`);

      const requirePath = path.join(resolvedRoot, key);

      if (asyncModes.has(mode)) {
        return Promise.resolve().then(() => require(requirePath));
      } else {
        return require(requirePath);
      }
    };

    requireContextEntry.keys = () => {
      return [...keys];
    };

    return requireContextEntry;
  };
};

let isSetup = false;

const setup = () => {
  if (isSetup)
    return;

  const prefix = `require.context = globalThis.makeRequireContext(module);\n`;
  globalThis.makeRequireContext = makeRequireContext;

  const compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    return compile.call(this, content.replace(/^\uFEFF?(#!.*?(\r\n|[\r\n]|$))?/, $0 => $0 + prefix), filename);
  };

  isSetup = true;
};

if (!require.main) {
  setup();
}

module.exports = {
  setup,
  makeRequireContext
};
