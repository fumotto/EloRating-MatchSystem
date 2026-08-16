// マッチング成立演出の状態（Issue #5）。
import { describe, it, expect, beforeEach } from "vitest";
import { useMatchFoundStore } from "./matchFoundStore";

const reset = () => useMatchFoundStore.setState({ matchId: null, shown: [] });

describe("matchFoundStore", () => {
  beforeEach(reset);

  it("starts with no overlay", () => {
    expect(useMatchFoundStore.getState().matchId).toBeNull();
  });

  it("shows the overlay for a new match", () => {
    useMatchFoundStore.getState().notify("match-1");
    expect(useMatchFoundStore.getState().matchId).toBe("match-1");
  });

  it("does not show the same match twice", () => {
    // ★Realtime は再接続時に取りこぼしを補うことがある。そのたびに
    //   全画面の演出が走ると操作を妨げる。
    const { notify, dismiss } = useMatchFoundStore.getState();
    notify("match-1");
    dismiss();
    notify("match-1");
    expect(useMatchFoundStore.getState().matchId).toBeNull();
  });

  it("shows a different match after the first one", () => {
    const { notify, dismiss } = useMatchFoundStore.getState();
    notify("match-1");
    dismiss();
    notify("match-2");
    expect(useMatchFoundStore.getState().matchId).toBe("match-2");
  });

  it("keeps the shown list bounded", () => {
    const { notify } = useMatchFoundStore.getState();
    for (let i = 0; i < 30; i += 1) notify(`match-${i}`);
    expect(useMatchFoundStore.getState().shown.length).toBeLessThanOrEqual(20);
  });

  it("clears the overlay on dismiss", () => {
    const { notify, dismiss } = useMatchFoundStore.getState();
    notify("match-1");
    dismiss();
    expect(useMatchFoundStore.getState().matchId).toBeNull();
  });
});
