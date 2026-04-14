import { type Proposal, type InsertProposal, proposals } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import * as https from "https";

// ---------------------------------------------------------------------------
// Turso cloud database — pure Node HTTPS, no native binaries
// Falls back to local SQLite in dev if no Turso URL set
// ---------------------------------------------------------------------------
const TURSO_URL = "libsql://aclear-proposals-aclearalternative-a11y.aws-us-west-2.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzU1ODk1MzQsImlkIjoiMDE5ZDY5NjItMTEwMS03YjA5LWI4NDctNDRmODQ3ZDA0NjA4IiwicmlkIjoiZjcyZmUxMDQtYmQ4Mi00YmVhLTllNzctZTdjOTY0MTI3NTdmIn0.gWl8e8E-EDJvjSfxQtr5qNmRLfd4ACyaAwdDl7R3bieFLObTZ52FrV5HRPKDvDuLwv20Jl41TlkkgVfjEZWcBA";

// Convert libsql:// URL to https:// for REST API
const TURSO_HTTP_URL = TURSO_URL.replace("libsql://", "https://");

// Execute a SQL statement against Turso via their HTTP API
async function tursoExecute(sql: string, args: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      requests: [{ type: "execute", stmt: { sql, args: args.map(v => {
        if (v === null || v === undefined) return { type: "null" };
        if (typeof v === "number") return { type: "integer", value: String(v) };
        return { type: "text", value: String(v) };
      }) } }]
    });

    const url = new URL(`${TURSO_HTTP_URL}/v2/pipeline`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TURSO_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const result = parsed.results?.[0];
          if (result?.type === "error") {
            reject(new Error(result.error?.message || "Turso error"));
          } else {
            resolve(result?.response?.result);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Convert a Turso row result to a Proposal object
function rowToProposal(cols: string[], row: any[]): Proposal {
  const obj: any = {};
  cols.forEach((col, i) => {
    const val = row[i]?.value ?? null;
    obj[toCamel(col)] = val;
  });
  // Parse numeric fields
  if (obj.id) obj.id = parseInt(obj.id);
  if (obj.deposit) obj.deposit = parseInt(obj.deposit) || 0;
  if (obj.numPeople) obj.numPeople = parseInt(obj.numPeople) || 3;
  if (obj.numBathrooms) obj.numBathrooms = parseInt(obj.numBathrooms) || 2;
  if (obj.rentalMode) obj.rentalMode = parseInt(obj.rentalMode) || 0;
  return obj as Proposal;
}

function toCamel(s: string): string {
  // Handle double-digit suffixes like customer_first_name_1 -> customerFirstName1
  return s
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/_([0-9])/g, (_, n) => n);
}

// Initialize schema in Turso
async function initTurso() {
  await tursoExecute(`CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    share_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'draft',
    customer_first_name_1 TEXT NOT NULL,
    customer_last_name_1 TEXT NOT NULL,
    customer_first_name_2 TEXT,
    customer_last_name_2 TEXT,
    customer_email TEXT NOT NULL,
    street TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'NJ',
    zip TEXT NOT NULL,
    rep_name TEXT NOT NULL,
    water_source TEXT NOT NULL,
    water_test_results TEXT NOT NULL DEFAULT '{}',
    num_people INTEGER NOT NULL DEFAULT 3,
    num_bathrooms INTEGER NOT NULL DEFAULT 2,
    packages TEXT NOT NULL DEFAULT '[]',
    selected_package TEXT,
    discount_type TEXT DEFAULT 'none',
    deposit INTEGER DEFAULT 0,
    rental_mode INTEGER DEFAULT 0,
    customer_signature_1 TEXT,
    customer_signature_2 TEXT,
    rep_signature TEXT,
    sent_date TEXT
  )`);
  console.log("Turso schema ready");
}

// Initialize on startup
initTurso().catch(e => console.error("Turso init error:", e.message));

// ---------------------------------------------------------------------------
// Local SQLite fallback for dev
// ---------------------------------------------------------------------------
const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
sqlite.exec(`CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  share_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  customer_first_name_1 TEXT NOT NULL DEFAULT '',
  customer_last_name_1 TEXT NOT NULL DEFAULT '',
  customer_first_name_2 TEXT, customer_last_name_2 TEXT,
  customer_email TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'NJ', zip TEXT NOT NULL DEFAULT '',
  rep_name TEXT NOT NULL DEFAULT '', water_source TEXT NOT NULL DEFAULT 'well',
  water_test_results TEXT NOT NULL DEFAULT '{}',
  num_people INTEGER NOT NULL DEFAULT 3, num_bathrooms INTEGER NOT NULL DEFAULT 2,
  packages TEXT NOT NULL DEFAULT '[]', selected_package TEXT,
  discount_type TEXT DEFAULT 'none', deposit INTEGER DEFAULT 0,
  rental_mode INTEGER DEFAULT 0, customer_signature_1 TEXT,
  customer_signature_2 TEXT, rep_signature TEXT, sent_date TEXT
)`);
const localDb = drizzle(sqlite);

const USE_TURSO = true; // Always use Turso in production

export interface IStorage {
  createProposal(proposal: InsertProposal): Promise<Proposal>;
  getProposal(id: number): Promise<Proposal | undefined>;
  getProposalByShareId(shareId: string): Promise<Proposal | undefined>;
  updateProposal(id: number, data: Partial<InsertProposal>): Promise<Proposal | undefined>;
  getAllProposals(): Promise<Proposal[]>;
  getProposalsNeedingFollowUp(daysOld: number): Promise<Proposal[]>;
}

export class DatabaseStorage implements IStorage {
  async createProposal(p: InsertProposal): Promise<Proposal> {
    const cols = [
      "share_id","status","customer_first_name_1","customer_last_name_1",
      "customer_first_name_2","customer_last_name_2","customer_email","customer_phone",
      "street","city","state","zip","rep_name","water_source",
      "water_test_results","num_people","num_bathrooms","packages",
      "selected_package","discount_type","custom_discount_value","deposit","rental_mode","sent_date"
    ];
    const vals = [
      p.shareId, p.status || "draft",
      p.customerFirstName1, p.customerLastName1,
      p.customerFirstName2 || null, p.customerLastName2 || null,
      p.customerEmail, p.customerPhone || null, p.street, p.city, p.state || "NJ", p.zip,
      p.repName, p.waterSource, p.waterTestResults || "{}",
      p.numPeople || 3, p.numBathrooms || 2, p.packages || "[]",
      p.selectedPackage || null, p.discountType || "none",
      p.customDiscountValue || 0, p.deposit || 0, p.rentalMode || 0, p.sentDate || null
    ];
    const placeholders = vals.map(() => "?").join(",");
    await tursoExecute(
      `INSERT INTO proposals (${cols.join(",")}) VALUES (${placeholders})`, vals
    );
    const result = await tursoExecute(
      "SELECT * FROM proposals WHERE share_id = ?", [p.shareId]
    );
    const row = result?.rows?.[0];
    const columns = result?.cols?.map((c: any) => c.name) || [];
    return rowToProposal(columns, row);
  }

  async getProposal(id: number): Promise<Proposal | undefined> {
    const result = await tursoExecute("SELECT * FROM proposals WHERE id = ?", [id]);
    const row = result?.rows?.[0];
    if (!row) return undefined;
    const columns = result?.cols?.map((c: any) => c.name) || [];
    return rowToProposal(columns, row);
  }

  async getProposalByShareId(shareId: string): Promise<Proposal | undefined> {
    const result = await tursoExecute("SELECT * FROM proposals WHERE share_id = ?", [shareId]);
    const row = result?.rows?.[0];
    if (!row) return undefined;
    const columns = result?.cols?.map((c: any) => c.name) || [];
    return rowToProposal(columns, row);
  }

  async updateProposal(id: number, data: Partial<InsertProposal>): Promise<Proposal | undefined> {
    const fieldMap: Record<string, string> = {
      status: "status", sentDate: "sent_date",
      customerSignature1: "customer_signature_1",
      customerSignature2: "customer_signature_2",
      repSignature: "rep_signature",
      selectedPackage: "selected_package",
    };
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in data) {
        sets.push(`${col} = ?`);
        vals.push((data as any)[key]);
      }
    }
    if (sets.length === 0) return this.getProposal(id);
    vals.push(id);
    await tursoExecute(`UPDATE proposals SET ${sets.join(", ")} WHERE id = ?`, vals);
    return this.getProposal(id);
  }

  async getAllProposals(): Promise<Proposal[]> {
    const result = await tursoExecute("SELECT * FROM proposals ORDER BY id DESC");
    const columns = result?.cols?.map((c: any) => c.name) || [];
    return (result?.rows || []).map((row: any) => rowToProposal(columns, row));
  }

  async getProposalsNeedingFollowUp(daysOld: number): Promise<Proposal[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const all = await this.getAllProposals();
    return all.filter(p => {
      if (p.status !== "sent") return false;
      if (!p.sentDate) return false;
      return new Date(p.sentDate) <= cutoff;
    });
  }
}

export const storage = new DatabaseStorage();
export { localDb as db };
