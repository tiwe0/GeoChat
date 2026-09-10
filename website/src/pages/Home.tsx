import { Hero } from "../sections/Hero";
import { Selling } from "../sections/Selling";
import { Pipeline } from "../sections/Pipeline";
import { Demo, Shots } from "../sections/Media";
import { Faq, Closing } from "../sections/Faq";
import { useDocumentMeta } from "../lib/useDocumentMeta";

export function Home() {
  useDocumentMeta("home");
  return (
    <>
      <Hero />
      <Selling />
      <Pipeline />
      <Demo />
      <Shots />
      <Faq />
      <Closing />
    </>
  );
}
