/* @refresh reload */

import { RouterProvider } from "@tanstack/solid-router";
import { render } from "solid-js/web";
import { getRouter } from "./router";
import "./styles/app.css";

const router = getRouter();

render(
  () => <RouterProvider router={router} />,
  document.getElementById("root")!,
);
