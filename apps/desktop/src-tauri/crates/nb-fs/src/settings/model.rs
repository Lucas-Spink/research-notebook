use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// The most recent projects kept. Older ones drop off the end.
pub const MAX_RECENT_PROJECTS: usize = 20;

/// A project the person opened before (FR-PRJ-03).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecentProject {
    /// The project's ULID from `project.yaml`, which survives a move.
    pub id: String,
    /// The name it had when last opened, so the list reads without opening.
    pub name: String,
    /// Where it was last found, on this machine.
    pub path: String,
}

/// Settings that belong to this machine and this person, not to any project.
///
/// Project files never hold a path outside the project, so the machine
/// specific location of an external root is kept here (spec 5.3, FR-PRJ-07).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Settings {
    /// Most recently opened first.
    #[serde(default)]
    pub recent_projects: Vec<RecentProject>,
    /// Project ULID, then external root ULID, to a folder on this machine.
    #[serde(default)]
    pub external_roots: BTreeMap<String, BTreeMap<String, String>>,
}

impl Settings {
    /// Records that a project was opened at `path`, first in the list.
    ///
    /// It replaces any entry for the same project, so moving a project only
    /// updates its path, and any entry at the same path, because a folder
    /// holds one project and the older entry would point at the wrong one.
    pub fn remember(&mut self, id: &str, name: &str, path: &str) {
        self.recent_projects
            .retain(|entry| entry.id != id && entry.path != path);
        self.recent_projects.insert(
            0,
            RecentProject {
                id: id.to_owned(),
                name: name.to_owned(),
                path: path.to_owned(),
            },
        );
        self.recent_projects.truncate(MAX_RECENT_PROJECTS);
    }

    /// Removes a project from the recent list. Its external root paths stay,
    /// so opening it again finds them.
    pub fn forget(&mut self, id: &str) {
        self.recent_projects.retain(|entry| entry.id != id);
    }

    /// The recent entry for a project, if any.
    pub fn recent(&self, id: &str) -> Option<&RecentProject> {
        self.recent_projects.iter().find(|entry| entry.id == id)
    }

    /// The folder on this machine for an external root of a project.
    pub fn external_root(&self, project_id: &str, root_id: &str) -> Option<&str> {
        self.external_roots
            .get(project_id)?
            .get(root_id)
            .map(String::as_str)
    }

    pub fn set_external_root(&mut self, project_id: &str, root_id: &str, path: &str) {
        self.external_roots
            .entry(project_id.to_owned())
            .or_default()
            .insert(root_id.to_owned(), path.to_owned());
    }

    /// Removes the path of an external root, and the project's entry when it
    /// has none left.
    pub fn clear_external_root(&mut self, project_id: &str, root_id: &str) {
        if let Some(roots) = self.external_roots.get_mut(project_id) {
            roots.remove(root_id);
            if roots.is_empty() {
                self.external_roots.remove(project_id);
            }
        }
    }
}
