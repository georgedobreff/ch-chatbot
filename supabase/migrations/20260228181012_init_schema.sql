create extension if not exists vector;

-- Create the table for the guidance documents
create table if not exists ch_guidance_documents (
  id bigint primary key generated always as identity,
  url text not null,
  title text not null,
  content text not null,
  embedding vector(768)
);

-- Create a table for chat session logging
create table if not exists ch_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_identifier text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists ch_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references ch_chat_sessions(id) on delete cascade not null,
  role text not null check (role in ('user', 'model', 'system')),
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create an index to speed up vector similarity search
create index on ch_guidance_documents using hnsw (embedding vector_l2_ops);

-- Create the RAG lookup function
create or replace function match_guidance (
  query_embedding vector(768),
  match_count int default 5
) returns table (
  id bigint,
  url text,
  title text,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    ch_guidance_documents.id,
    ch_guidance_documents.url,
    ch_guidance_documents.title,
    ch_guidance_documents.content,
    1 - (ch_guidance_documents.embedding <=> query_embedding) as similarity
  from ch_guidance_documents
  order by ch_guidance_documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
