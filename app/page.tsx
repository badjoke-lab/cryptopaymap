// app/page.tsx
import MapPage, { metadata as mapMetadata } from "./map/page";
import type { Metadata } from "next";

// このモジュール内で値として export する（re-export は避ける）
export const metadata: Metadata = mapMetadata;

export default MapPage;
