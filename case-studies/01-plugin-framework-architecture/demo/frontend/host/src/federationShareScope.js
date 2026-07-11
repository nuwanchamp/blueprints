import * as ReactModule from 'react';
import * as ReactDomModule from 'react-dom';
import * as ReactDomClientModule from 'react-dom/client';
import * as ReactJsxRuntimeModule from 'react/jsx-runtime';

function share(module, version) {
  return {
    [version]: {
      get: async () => () => module,
      loaded: true,
      scope: 'default',
    },
  };
}

const reactVersion = ReactModule.version ?? '19.0.0';
const reactDomVersion = ReactDomModule.version ?? reactVersion;

const federationShareScope = {
  react: share(ReactModule, reactVersion),
  'react-dom': share(ReactDomModule, reactDomVersion),
  'react-dom/client': share(ReactDomClientModule, reactDomVersion),
  'react/jsx-runtime': share(ReactJsxRuntimeModule, reactVersion),
};

export function getFederationShareScope() {
  return federationShareScope;
}
