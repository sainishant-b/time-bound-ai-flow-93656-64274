-- Add pinned field to conversations table for favoriting
ALTER TABLE public.conversations 
ADD COLUMN pinned BOOLEAN DEFAULT false;