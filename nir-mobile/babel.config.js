module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      'babel-preset-expo',
      ['@babel/preset-typescript', { isTSX: true, allExtensions: true, onlyRemoveTypeImports: true }],
    ],
    plugins: ['nativewind/babel'],
  };
};
