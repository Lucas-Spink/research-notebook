use rusqlite::types::ValueRef;

use crate::schema::TABLES;
use crate::store::Index;
use crate::IndexError;

impl Index {
    /// Every table's rows as text, tables in a fixed order and rows sorted,
    /// so two indexes hold the same data exactly when their dumps are equal.
    /// Row ids and the order of insertion do not appear. For the rebuild
    /// equality test (S2-G07) and for diagnosing an index.
    pub fn dump(&self) -> Result<String, IndexError> {
        let mut out = String::new();
        for table in TABLES {
            out.push_str(&format!("[{table}]\n"));
            for line in self.table_lines(table)? {
                out.push_str(&line);
                out.push('\n');
            }
        }
        Ok(out)
    }

    fn table_lines(&self, table: &str) -> Result<Vec<String>, IndexError> {
        let mut statement = self.conn.prepare(&format!("SELECT * FROM {table}"))?;
        let columns = statement.column_count();
        let mut rows = statement.query([])?;
        let mut lines = Vec::new();
        while let Some(row) = rows.next()? {
            let mut cells = Vec::with_capacity(columns);
            for i in 0..columns {
                cells.push(cell(row.get_ref(i)?));
            }
            lines.push(cells.join("\t"));
        }
        lines.sort();
        Ok(lines)
    }
}

fn cell(value: ValueRef<'_>) -> String {
    match value {
        ValueRef::Null => "NULL".to_owned(),
        ValueRef::Integer(n) => n.to_string(),
        ValueRef::Real(x) => x.to_string(),
        ValueRef::Text(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        ValueRef::Blob(bytes) => format!("<{} bytes>", bytes.len()),
    }
}
