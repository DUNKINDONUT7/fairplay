import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';

function normalizeTemplate(row) {
  return {
    id: row.id,
    name: row.name || 'Untitled Rubric',
    eventType: row.eventType || row.event_type || '',
    criteria: row.criteria || [],
    scoringMethod: row.scoringMethod || row.scoring_method || 'Weighted Rubric',
    tieBreaker: row.tieBreaker || row.tie_breaker || [],
    judgeInstructions: row.judgeInstructions || row.judge_instructions || '',
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
  };
}

const useRubricTemplateStore = create(
  persist(
    (set, get) => ({
      templates: [],
      loading: false,

      fetchTemplates: async () => {
        if (!isSupabaseConfigured) return get().templates;
        set({ loading: true });
        try {
          const { data, error } = await supabase
            .from('rubric_templates')
            .select('*')
            .order('created_at', { ascending: false });
          if (error) throw error;
          const templates = (data || []).map(normalizeTemplate);
          set({ templates, loading: false });
          return templates;
        } catch (error) {
          console.error('Error fetching rubric templates:', error.message);
          set({ loading: false });
          return get().templates;
        }
      },

      saveTemplate: async ({ name, eventType, criteria, scoringMethod, tieBreaker, judgeInstructions }) => {
        const template = normalizeTemplate({
          id: Date.now(),
          name,
          eventType,
          criteria,
          scoringMethod,
          tieBreaker,
          judgeInstructions,
        });

        set((state) => ({ templates: [template, ...state.templates] }));

        if (!isSupabaseConfigured) return template;

        try {
          const { error } = await supabase.from('rubric_templates').insert({
            id: template.id,
            name: template.name,
            event_type: template.eventType,
            criteria: template.criteria,
            scoring_method: template.scoringMethod,
            tie_breaker: template.tieBreaker,
            judge_instructions: template.judgeInstructions,
            created_at: template.createdAt,
          });
          if (error) throw error;
        } catch (error) {
          console.error('Error saving rubric template:', error.message);
        }

        return template;
      },

      deleteTemplate: async (templateId) => {
        set((state) => ({ templates: state.templates.filter((t) => String(t.id) !== String(templateId)) }));
        if (!isSupabaseConfigured) return;
        try {
          await supabase.from('rubric_templates').delete().eq('id', templateId);
        } catch (error) {
          console.error('Error deleting rubric template:', error.message);
        }
      },
    }),
    { name: 'fairplay_rubric_templates' }
  )
);

export default useRubricTemplateStore;
