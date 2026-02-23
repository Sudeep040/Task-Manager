import { validateStatusTransition, applyStatusUpdate } from "@/lib/taskService";
import { TaskStatus } from "@/lib/db/models/Task";

describe("validateStatusTransition", () => {
  it("allows todo -> in_progress", () => {
    expect(validateStatusTransition("todo", "in_progress")).toEqual({ allowed: true });
  });

  it("allows in_progress -> done", () => {
    expect(validateStatusTransition("in_progress", "done")).toEqual({ allowed: true });
  });

  it("allows in_progress -> archived", () => {
    expect(validateStatusTransition("in_progress", "archived")).toEqual({ allowed: true });
  });

  it("allows done -> in_progress (re-open)", () => {
    expect(validateStatusTransition("done", "in_progress")).toEqual({ allowed: true });
  });

  it("blocks archived -> any other status (archived is terminal)", () => {
    const statuses: TaskStatus[] = ["todo", "in_progress", "done"];
    for (const to of statuses) {
      const result = validateStatusTransition("archived", to);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain("archived");
      }
    }
  });

  it("blocks todo -> done directly", () => {
    const result = validateStatusTransition("todo", "done");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("todo");
      expect(result.reason).toContain("done");
    }
  });

  it("allows same-status transition (no-op)", () => {
    const statuses: TaskStatus[] = ["todo", "in_progress", "done", "archived"];
    for (const s of statuses) {
      expect(validateStatusTransition(s, s)).toEqual({ allowed: true });
    }
  });
});

describe("applyStatusUpdate", () => {
  const baseTask = { _id: "t1", title: "Test", status: "todo" as TaskStatus };

  it("returns updated task when transition is valid", () => {
    const updated = applyStatusUpdate(baseTask, "in_progress");
    expect(updated.status).toBe("in_progress");
    expect(updated._id).toBe("t1");
  });

  it("does not mutate the original task (immutable update)", () => {
    applyStatusUpdate(baseTask, "in_progress");
    expect(baseTask.status).toBe("todo");
  });

  it("throws when transition is invalid", () => {
    const archivedTask = { ...baseTask, status: "archived" as TaskStatus };
    expect(() => applyStatusUpdate(archivedTask, "todo")).toThrow();
  });

  it("returns same status object when status unchanged", () => {
    const result = applyStatusUpdate(baseTask, "todo");
    expect(result.status).toBe("todo");
  });
});
