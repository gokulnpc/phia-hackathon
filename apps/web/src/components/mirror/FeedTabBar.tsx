"use client";

import { useState } from "react";
import { Tab, Tabs } from "./primitives";

/** UI-only tabs; both show the same feed data until For You ranking exists. */
export function FeedTabBar() {
  const [tab, setTab] = useState<"following" | "foryou">("following");

  return (
    <Tabs>
      <Tab active={tab === "following"} onClick={() => setTab("following")}>
        Following
      </Tab>
      <Tab active={tab === "foryou"} onClick={() => setTab("foryou")}>
        For you
      </Tab>
    </Tabs>
  );
}
