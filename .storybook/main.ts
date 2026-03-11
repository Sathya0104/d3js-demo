import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  "stories": [
<<<<<<< HEAD
    "../src/*.mdx",
=======
    "../src/**/*.mdx",
>>>>>>> 0e9519a19a6b2c7e352bb9c21892cf3dfc19d2a9
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs"
  ],
  "framework": "@storybook/react-vite"
};
export default config;