import { view } from './storybook.requires';

const StorybookUIRoot = view.getStorybookUI({
  // Optional: enable on-device controls
  enableWebsockets: false,
});

export default StorybookUIRoot;
