use crate::store::Index;
use crate::IndexError;

impl Index {
    pub fn dump(&self) -> Result<String, IndexError> {
        Ok(String::new())
    }
}
