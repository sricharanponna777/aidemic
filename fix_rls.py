#!/usr/bin/env python
"""Fix RLS policy violation by adding user_id to deck creation"""

with open('src/app/dashboard/flashcards/page.tsx', 'r') as f:
    content = f.read()

# Replace the insert block
old = '''      const { data, error } = await supabase
        .from('flashcard_decks')
        .insert([
          {
            name: newDeckName,
            card_count: 0,
          },
        ])'''

new = '''      // Get current user to set user_id in deck (required by RLS policy)
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.error('User not authenticated');
        return;
      }
      const { data, error } = await supabase
        .from('flashcard_decks')
        .insert([
          {
            user_id: user.id,
            name: newDeckName,
            card_count: 0,
          },
        ])'''

content = content.replace(old, new)

with open('src/app/dashboard/flashcards/page.tsx', 'w') as f:
    f.write(content)

print('✅ File updated successfully - user_id now included in deck creation')
