const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'src', 'pages');
const pages = ['Equipment.tsx', 'Spareparts.tsx', 'Tools.tsx', 'Consumables.tsx', 'PM.tsx', 'Troubleshooting.tsx', 'Users.tsx'];

pages.forEach(page => {
  const filePath = path.join(pagesDir, page);
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Add selectedIds and isBulkDeleteModalOpen states
  if (!content.includes('selectedIds')) {
    content = content.replace(
      /const \[deleteId, setDeleteId\] = useState<number \| null>\(null\);/,
      `const [deleteId, setDeleteId] = useState<number | null>(null);\n  const [selectedIds, setSelectedIds] = useState<number[]>([]);\n  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);`
    );
  }

  // 2. Add handleSelectAll and handleSelect functions
  if (!content.includes('handleSelectAll')) {
    const listVarMatch = content.match(/const filtered([a-zA-Z]+) = /);
    const listVar = listVarMatch ? `filtered${listVarMatch[1]}` : (content.includes('filteredItems') ? 'filteredItems' : (content.includes('filteredUsers') ? 'filteredUsers' : 'filteredEquipment'));
    
    const selectFunctions = `
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(${listVar}.map((item: any) => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const confirmBulkDelete = async () => {
    try {
      const token = localStorage.getItem('token');
      await Promise.all(selectedIds.map(id => fetch(\`/api/${page.toLowerCase().replace('.tsx', '') === 'equipment' ? 'equipment' : page.toLowerCase().replace('.tsx', '') === 'users' ? 'users' : page.toLowerCase().replace('.tsx', '') === 'spareparts' ? 'spareparts' : page.toLowerCase().replace('.tsx', '') === 'tools' ? 'tools' : page.toLowerCase().replace('.tsx', '') === 'consumables' ? 'consumables' : page.toLowerCase().replace('.tsx', '') === 'pm' ? 'pm' : 'troubleshooting'}/\${id}\`, {
        method: 'DELETE',
        headers: { Authorization: \`Bearer \${token}\` }
      })));
      ${content.includes('fetchEquipment') ? 'fetchEquipment();' : content.includes('fetchUsers') ? 'fetchUsers();' : 'fetchData();'}
      setSelectedIds([]);
    } catch (error) {
      console.error('Error bulk deleting:', error);
    } finally {
      setIsBulkDeleteModalOpen(false);
    }
  };
`;
    content = content.replace(/const handleDelete = \(id: number\) => \{/, selectFunctions + '\n  const handleDelete = (id: number) => {');
  }

  // 3. Update handleExportPDF to use selected items if any
  if (content.includes('handleExportPDF')) {
    const listVarMatch = content.match(/const filtered([a-zA-Z]+) = /);
    const listVar = listVarMatch ? `filtered${listVarMatch[1]}` : (content.includes('filteredItems') ? 'filteredItems' : (content.includes('filteredUsers') ? 'filteredUsers' : 'filteredEquipment'));
    
    // Replace the first check
    content = content.replace(
      /if \([a-zA-Z]+.length === 0\) \{\s*alert\("No data to export"\);\s*return;\s*\}/,
      `const itemsToExport = selectedIds.length > 0 ? ${listVar}.filter((item: any) => selectedIds.includes(item.id)) : ${listVar};\n    if (itemsToExport.length === 0) {\n      alert("No data to export");\n      return;\n    }`
    );
    
    // Replace the map variable
    const mapRegex = new RegExp(`const tableRows = [a-zA-Z]+\\.map\\(\\(item\\) => \\[`);
    content = content.replace(mapRegex, `const tableRows = itemsToExport.map((item: any) => [`);
  }

  // 4. Add Checkboxes to Table Header
  if (!content.includes('onChange={handleSelectAll}')) {
    content = content.replace(
      /<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID<\/th>/,
      `<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                  <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" onChange={handleSelectAll} checked={selectedIds.length > 0 && selectedIds.length === (content.includes('filteredItems') ? filteredItems : content.includes('filteredUsers') ? filteredUsers : filteredEquipment).length} />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>`
    );
  }

  // 5. Add Checkboxes to Table Body
  if (!content.includes('checked={selectedIds.includes(item.id)}')) {
    content = content.replace(
      /<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\{item\.id\}<\/td>/,
      `<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={selectedIds.includes(item.id)} onChange={() => handleSelect(item.id)} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.id}</td>`
    );
  }

  // 6. Add Bulk Delete Button
  if (!content.includes('Delete Selected')) {
    content = content.replace(
      /\{canEdit && \(\s*<button\s*onClick=\{[^\}]+\}\s*className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center shadow-sm"\s*>/,
      `{canEdit && selectedIds.length > 0 && (
            <button onClick={() => setIsBulkDeleteModalOpen(true)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md flex items-center shadow-sm mr-2">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedIds.length})
            </button>
          )}
          {canEdit && (
            <button onClick={() => { setEditingItem(null); setFormData({ name: '', description: '' }); setIsModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center shadow-sm">`
    );
    // Fallback if the exact button match fails
    if (!content.includes('Delete Selected')) {
       content = content.replace(
        /\{canEdit && \(\s*<button\s*onClick=\{[^\}]+\}\s*className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center shadow-sm text-sm"\s*>/,
        `{canEdit && selectedIds.length > 0 && (
            <button onClick={() => setIsBulkDeleteModalOpen(true)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md flex items-center shadow-sm text-sm mr-2">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedIds.length})
            </button>
          )}
          {canEdit && (
            <button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center shadow-sm text-sm">`
      );
    }
  }

  // 7. Add Bulk Delete Modal
  if (!content.includes('isBulkDeleteModalOpen')) {
    content = content.replace(
      /<\/div>\s*\);\s*\}\s*$/,
      `
      {/* Bulk Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        onConfirm={confirmBulkDelete}
        title="Delete Selected Items"
        message={\`Are you sure you want to delete \${selectedIds.length} selected items? This action cannot be undone.\`}
      />
    </div>
  );
}
`
    );
  }

  fs.writeFileSync(filePath, content);
});

console.log('Done updating pages with checkboxes and bulk delete.');
