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
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
      console.log(`RLS enabled on ${table}`);
    } catch (e) {
      console.log(`Failed to enable RLS on ${table}: ${e.message}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
