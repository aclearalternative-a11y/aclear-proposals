import { type Proposal, type InsertProposal, proposals } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";

// Use persistent disk on Render (/data), fall back to local for dev
const DB_PATH = process.env.NODE_ENV === "production" && require("fs").existsSync("/data")
  ? "/data/data.db"
  : "data.db";
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

// Auto-create tables on startup (handles fresh DB on Render)
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

export const db = drizzle(sqlite);

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
    return db.insert(proposals).values(proposal).returning().get();
  }

  async getProposal(id: number): Promise<Proposal | undefined> {
    return db.select().from(proposals).where(eq(proposals.id, id)).get();
  }

  async getProposalByShareId(shareId: string): Promise<Proposal | undefined> {
    return db.select().from(proposals).where(eq(proposals.shareId, shareId)).get();
  }

  async updateProposal(id: number, data: Partial<InsertProposal>): Promise<Proposal | undefined> {
    return db.update(proposals).set(data).where(eq(proposals.id, id)).returning().get();
  }

  async getAllProposals(): Promise<Proposal[]> {
    return db.select().from(proposals).all();
  }

  // Returns proposals that were sent 3+ days ago, not yet signed or followed up
  async getProposalsNeedingFollowUp(daysOld: number): Promise<Proposal[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const all = await this.getAllProposals();
    return all.filter(p => {
      if (p.status !== "sent") return false;
      if (!p.sentDate) return false;
      const sent = new Date(p.sentDate);
      return sent <= cutoff;
    });
  }
}

export const storage = new DatabaseStorage();
