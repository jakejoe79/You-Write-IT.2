// InventoryHighlight - Highlights inventory items in text

export default function InventoryHighlight({ item }) {
  return (
    <span 
      className="inventory-highlight"
      style={{ 
        backgroundColor: '#fef08a',
        borderBottom: '2px solid #facc15',
        cursor: 'pointer',
      }}
      title={`Inventory: ${item}`}
    >
      {item}
    </span>
  );
}
