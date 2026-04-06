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

export const db = drizzle(sqlite);

export interface IStorage {
  createProposal(proposal: InsertProposal): Promise<Proposal>;
  getProposal(id: number): Promise<Proposal | undefined>;
  getProposalByShareId(shareId: string): Promise<Proposal | undefined>;
  updateProposal(id: number, data: Partial<InsertProposal>): Promise<Proposal | undefined>;
  getAllProposals(): Promise<Proposal[]>;
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
}

export const storage = new DatabaseStorage();
