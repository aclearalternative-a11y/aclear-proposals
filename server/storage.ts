import { type Proposal, type InsertProposal, proposals } from "@shared/schema";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client/http";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Database setup — Turso (cloud) when env vars set, local SQLite for dev
// ---------------------------------------------------------------------------
const TURSO_URL = process.env.TURSO_DATABASE_URL ||
  "libsql://aclear-proposals-aclearalternative-a11y.aws-us-west-2.turso.io";
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN ||
  "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzU1ODk1MzQsImlkIjoiMDE5ZDY5NjItMTEwMS03YjA5LWI4NDctNDRmODQ3ZDA0NjA4IiwicmlkIjoiZjcyZmUxMDQtYmQ4Mi00YmVhLTllNzctZTdjOTY0MTI3NTdmIn0.gWl8e8E-EDJvjSfxQtr5qNmRLfd4ACyaAwdDl7R3bieFLObTZ52FrV5HRPKDvDuLwv20Jl41TlkkgVfjEZWcBA";

let db: any;

if (TURSO_URL && TURSO_TOKEN) {
  // Production: use Turso cloud database (never resets, survives Render deploys)
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  db = drizzleLibsql(client);
  console.log("Using Turso cloud database:", TURSO_URL);
} else {
  // Local dev: use SQLite file
  const DB_PATH = "data.db";
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS proposals (
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
    )
  `);
  db = drizzleSqlite(sqlite);
  console.log("Using local SQLite database: data.db");
}

export { db };

export interface IStorage {
  createProposal(proposal: InsertProposal): Promise<Proposal>;
  getProposal(id: number): Promise<Proposal | undefined>;
  getProposalByShareId(shareId: string): Promise<Proposal | undefined>;
  updateProposal(id: number, data: Partial<InsertProposal>): Promise<Proposal | undefined>;
  getAllProposals(): Promise<Proposal[]>;
  getProposalsNeedingFollowUp(daysOld: number): Promise<Proposal[]>;
}

export class DatabaseStorage implements IStorage {
  async createProposal(proposal: InsertProposal): Promise<Proposal> {
    const result = await db.insert(proposals).values(proposal).returning();
    return Array.isArray(result) ? result[0] : result;
  }

  async getProposal(id: number): Promise<Proposal | undefined> {
    const result = await db.select().from(proposals).where(eq(proposals.id, id));
    return Array.isArray(result) ? result[0] : result;
  }

  async getProposalByShareId(shareId: string): Promise<Proposal | undefined> {
    const result = await db.select().from(proposals).where(eq(proposals.shareId, shareId));
    return Array.isArray(result) ? result[0] : result;
  }

  async updateProposal(id: number, data: Partial<InsertProposal>): Promise<Proposal | undefined> {
    const result = await db.update(proposals).set(data).where(eq(proposals.id, id)).returning();
    return Array.isArray(result) ? result[0] : result;
  }

  async getAllProposals(): Promise<Proposal[]> {
    const result = await db.select().from(proposals);
    return Array.isArray(result) ? result : [];
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
