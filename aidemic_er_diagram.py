# AIDemic ER Diagram — paste into Google Colab and run

# !apt-get install -q graphviz
# !pip install -q graphviz

import graphviz
from IPython.display import display, Image

dot = graphviz.Digraph("AIDemic_ER", format="png")
dot.attr(
    rankdir="LR",
    splines="ortho",
    nodesep="0.5",
    ranksep="1.2",
    bgcolor="#f0f2f5",
    ratio="1",
    size="12,12",
)
dot.attr("node", shape="box", style="filled,rounded", fillcolor="white",
         fontname="Helvetica", fontsize="11", margin="0.2,0.1", penwidth="1.5")
dot.attr("edge", color="#555555", penwidth="1.2", arrowsize="0.7")

# ── Nodes (colour-coded by cluster) ──────────────────────────────────────────

AUTH   = {"fillcolor": "#dfe6e9", "color": "#7f8c8d"}
USERS  = {"fillcolor": "#d5f5e3", "color": "#1abc9c"}
FLASH  = {"fillcolor": "#d6eaf8", "color": "#3498db"}
STUDY  = {"fillcolor": "#e8daef", "color": "#9b59b6"}
CONTENT= {"fillcolor": "#fdebd0", "color": "#e67e22"}

dot.node("auth_users",              "auth.users",              **AUTH)
dot.node("user_profiles",           "user_profiles",           **USERS)
dot.node("user_statistics",         "user_statistics",         **USERS)
dot.node("user_subjects",           "user_subjects",           **USERS)
dot.node("flashcard_decks",         "flashcard_decks",         **FLASH)
dot.node("flashcards",              "flashcards",              **FLASH)
dot.node("flashcard_tags",          "flashcard_tags",          **FLASH)
dot.node("flashcard_tag_mapping",   "flashcard_tag_mapping",   **FLASH)
dot.node("study_sessions",          "study_sessions",          **STUDY)
dot.node("study_session_results",   "study_session_results",   **STUDY)
dot.node("study_goals",             "study_goals",             **STUDY)
dot.node("exam_practice_attempts",  "exam_practice_attempts",  **CONTENT)
dot.node("generated_videos",        "generated_videos",        **CONTENT)

# ── Edges ─────────────────────────────────────────────────────────────────────

many = {"arrowhead": "crow", "arrowtail": "tee",  "dir": "both"}
one  = {"arrowhead": "tee",  "arrowtail": "tee",  "dir": "both"}
opt  = {"arrowhead": "crow", "arrowtail": "odot", "dir": "both"}

dot.edge("user_profiles",          "auth_users", **one)
dot.edge("user_statistics",        "auth_users", **one)
dot.edge("user_subjects",          "auth_users", **many)
dot.edge("flashcard_decks",        "auth_users", **many)
dot.edge("study_sessions",         "auth_users", **many)
dot.edge("study_goals",            "auth_users", **many)
dot.edge("generated_videos",       "auth_users", **many)
dot.edge("exam_practice_attempts", "auth_users", **many)

dot.edge("flashcard_tags",          "flashcard_decks", **many)
dot.edge("flashcards",              "flashcard_decks", **many)
dot.edge("study_sessions",          "flashcard_decks", **many)
dot.edge("study_goals",             "flashcard_decks", **many)

dot.edge("flashcard_tag_mapping",   "flashcards",      **many)
dot.edge("study_session_results",   "flashcards",      **many)
dot.edge("generated_videos",        "flashcards",      **opt)

dot.edge("flashcard_tag_mapping",   "flashcard_tags",  **many)
dot.edge("study_session_results",   "study_sessions",  **many)

# ── Render ────────────────────────────────────────────────────────────────────

dot.render("/tmp/aidemic_er", view=False, cleanup=True)
display(Image("/tmp/aidemic_er.png"))
