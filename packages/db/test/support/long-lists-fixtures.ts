/** Migration `*_long_lists` (TK-94) : suffixe du dossier et index qu'elle crée (colonnes générées exclues). */
export const LONG_LISTS_SUFFIX = "_long_lists";

export const LONG_LISTS_INDEXES = [
  "spec_features_snapshot_id_spec_number_id_idx",
  "spec_features_search_idx",
  "tickets_project_id_priority_rank_key_number_id_idx",
  "tickets_project_id_status_priority_rank_key_number_id_idx",
  "tickets_search_idx",
] as const;
