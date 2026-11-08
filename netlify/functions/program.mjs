// Living Word Fellowship Church — Sunday Program API (Netlify Function)
// Saves each Sunday's program in Netlify Blobs. Viewing needs no code; saving needs EDIT_CODE.
// Change the code in Netlify: Site configuration > Environment variables > EDIT_CODE.
import { getStore } from "@netlify/blobs";

const EDIT_CODE = process.env.EDIT_CODE || "4405";
const KEEP = 104;
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default async (req) => {
  const store = getStore({ name: "programs", consistency: "strong" });

  const listDates = async () => {
    const { blobs } = await store.list({ prefix: "prog/" });
    return blobs.map((b) => b.key.slice(5)).sort().reverse();
  };
  const latest = async () => {
    const list = await listDates();
    const t = today();
    const upcoming = list.filter((d) => d >= t).sort();
    return upcoming[0] || list[0] || null;
  };
  const needCode = (c) => { if (String(c || "") !== EDIT_CODE) throw new Error("The edit code is not correct."); };

  try {
    let action, a;
    if (req.method === "GET") {
      const u = new URL(req.url);
      action = u.searchParams.get("api");
      a = Object.fromEntries(u.searchParams);
    } else if (req.method === "POST") {
      a = await req.json().catch(() => ({}));
      action = a.action;
    } else return json({ ok: false, error: "Method not allowed" }, 405);

    let result;
    switch (action) {
      case "listPrograms":
        result = await listDates();
        break;
      case "getProgram": {
        const d = a.date || (await latest());
        result = d ? await store.get("prog/" + d, { type: "json" }) : null;
        break;
      }
      case "checkCode":
        result = String(a.code || "") === EDIT_CODE;
        break;
      case "saveProgram": {
        needCode(a.code);
        const p = a.program;
        if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p.date || "")) throw new Error("Please choose a service date.");
        p.savedAt = new Date().toISOString();
        if (JSON.stringify(p).length > 50000) throw new Error("This program is too long to save.");
        await store.setJSON("prog/" + p.date, p);
        const list = await listDates();
        for (const old of list.slice(KEEP)) await store.delete("prog/" + old);
        result = p.date;
        break;
      }
      case "deleteProgram":
        needCode(a.code);
        await store.delete("prog/" + a.date);
        result = true;
        break;
      default:
        throw new Error("Unknown request.");
    }
    return json({ ok: true, result });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
};

export const config = { path: "/api" };
