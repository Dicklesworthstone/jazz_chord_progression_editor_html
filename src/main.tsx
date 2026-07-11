import { render } from "preact";

import { App } from "./ui";

const mountPoint = document.querySelector<HTMLElement>("#app");

if (mountPoint === null) {
  throw new Error("Changes could not find its application mount point.");
}

render(<App />, mountPoint);
