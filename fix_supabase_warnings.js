import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const tables = [
  'users', 'profiles', 'documents', 'ai_jobs', 'payments', 'subscriptions',
  'job_applications', 'community_posts', 'post_comments', 'post_upvotes',
  'companies', 'job_postings', 'candidate_matches', 'ai_generations',
  'activity_events', 'notifications', 'workflows', 'conversations',
  'messages', 'tool_outputs', 'resume_templates', 'studio_resumes', 'credit_audit'
];

async function main() {
  for (const table of tables) {
    try {
      // Revoke all access from anon and authenticated roles
      await prisma.$executeRawUnsafe(`REVOKE ALL ON "${table}" FROM anon;`);
      await prisma.$executeRawUnsafe(`REVOKE ALL ON "${table}" FROM authenticated;`);
      console.log(`Revoked anon/authenticated access on ${table}`);
      
      // Create a deny-all policy to satisfy the "RLS Enabled No Policy" info warning
      try {
        await prisma.$executeRawUnsafe(`CREATE POLICY "Deny All" ON "${table}" FOR ALL USING (false);`);
        console.log(`Created Deny All policy on ${table}`);
      } catch (e) {
        // Policy might already exist, ignore
      }
    } catch (e) {
      console.log(`Failed to process ${table}: ${e.message}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
