//! Styled data table with header, rows, and optional selection.

use ratatui::{
    layout::{Constraint, Rect},
    text::Span,
    widgets::{Block, Borders, Row, Table},
    Frame,
};

use crate::monitor::theme::styles;

pub struct DataTableColumn {
    pub header: String,
    pub width: Constraint,
}

impl DataTableColumn {
    pub fn new(header: impl Into<String>, width: Constraint) -> Self {
        Self {
            header: header.into(),
            width,
        }
    }
}

pub struct DataTable<'a> {
    pub columns: &'a [DataTableColumn],
    pub rows: Vec<Vec<String>>,
    pub selected_row: Option<usize>,
    pub title: &'a str,
    pub focused: bool,
}

impl<'a> DataTable<'a> {
    pub fn new(title: &'a str, columns: &'a [DataTableColumn], rows: Vec<Vec<String>>) -> Self {
        Self {
            columns,
            rows,
            selected_row: None,
            title,
            focused: false,
        }
    }

    pub fn selected(mut self, index: Option<usize>) -> Self {
        self.selected_row = index;
        self
    }

    pub fn focused(mut self, focused: bool) -> Self {
        self.focused = focused;
        self
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let header = Row::new(
            self.columns
                .iter()
                .map(|c| c.header.clone())
                .collect::<Vec<_>>(),
        )
        .style(styles::heading())
        .bottom_margin(1);

        let rows: Vec<Row> = self
            .rows
            .iter()
            .enumerate()
            .map(|(i, row)| {
                let style = if self.selected_row == Some(i) {
                    styles::selected()
                } else {
                    styles::secondary()
                };
                Row::new(row.clone()).style(style)
            })
            .collect();

        let widths: Vec<Constraint> = self.columns.iter().map(|c| c.width).collect();

        let block = Block::default()
            .borders(Borders::ALL)
            .title(Span::styled(self.title, styles::title(self.focused)))
            .border_style(styles::border(self.focused));

        let table = Table::new(rows, widths).header(header).block(block);
        frame.render_widget(table, area);
    }
}
