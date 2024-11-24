const BlockGrid = () => {
    const [hoveredCell, setHoveredCell] = React.useState(null);

    const gridSize = 8;
    const grid = [];

    // Generate the grid pattern
    for (let row = 0; row < gridSize; row++) {
        const rowCells = [];
        for (let col = 0; col < gridSize; col++) {
            let cellType;
            if (row % 2 === 0) {
                cellType = col % 2 === 0 ? 'A' : 'C';
            } else {
                cellType = col % 2 === 0 ? 'D' : 'B';
            }
            rowCells.push(cellType);
        }
        grid.push(rowCells);
    }

    const getDirectDependencies = (row, col, type) => {
        const deps = new Set();
        
        for (let r = row-1; r <= row+1; r++) {
            for (let c = col-1; c <= col+1; c++) {
                if (r >= 0 && r < gridSize && c >= 0 && c < gridSize) {
                    const targetType = grid[r][c];
                    if (type === 'B' && targetType === 'A') {
                        deps.add(`${r},${c}`);
                    } else if (type === 'C' && (targetType === 'A' || targetType === 'B')) {
                        deps.add(`${r},${c}`);
                    } else if (type === 'D' && (targetType === 'A' || targetType === 'B' || targetType === 'C')) {
                        deps.add(`${r},${c}`);
                    }
                }
            }
        }
        return deps;
    };

    const getAllDependencies = (row, col, type) => {
        const allDeps = new Set();
        const directDeps = getDirectDependencies(row, col, type);
        
        directDeps.forEach(dep => {
            allDeps.add(dep);
            const [depRow, depCol] = dep.split(',').map(Number);
            const depType = grid[depRow][depCol];
            
            if (depType !== 'A') {
                const subDeps = getAllDependencies(depRow, depCol, depType);
                subDeps.forEach(subDep => allDeps.add(subDep));
            }
        });
        
        return allDeps;
    };

    const getBaseColor = (type) => {
        switch(type) {
            case 'A': return '#a0d8ef';
            case 'B': return '#f8b862';
            case 'C': return '#8db255';
            case 'D': return '#d3381c';
            default: return '#ffffff';
        }
    };

    const getCellStyle = (row, col, type) => {
        const baseColor = getBaseColor(type);
        const style = { backgroundColor: baseColor };

        if (!hoveredCell) return style;
        
        const [hRow, hCol] = hoveredCell.split(',').map(Number);
        const hoveredType = grid[hRow][hCol];
        
        if (row === hRow && col === hCol) {
            style.backgroundColor = '#ff0000'; // Red for hovered cell
        } else {
            const deps = getAllDependencies(hRow, hCol, hoveredType);
            if (!deps.has(`${row},${col}`) && !(row === hRow && col === hCol)) {
                style.opacity = 0.2; // Dim non-dependent cells
            }
        }
        
        return style;
    };

    return (
        React.createElement('div', { 
            className: "flex flex-col items-center",
            style: { minHeight: '400px', position: 'relative' }
        }, 
            React.createElement('div', { 
                className: "grid gap-1 mb-16", 
                style: { gridTemplateColumns: `repeat(${gridSize}, 40px)` }
            }, 
                grid.map((row, rowIndex) => 
                    row.map((cell, colIndex) => 
                        React.createElement('div', {
                            key: `${rowIndex}-${colIndex}`,
                            className: "h-10 flex items-center justify-center text-white font-bold cursor-pointer transition-all duration-200",
                            style: getCellStyle(rowIndex, colIndex, cell),
                            onMouseEnter: () => setHoveredCell(`${rowIndex},${colIndex}`),
                            onMouseLeave: () => setHoveredCell(null)
                        }, cell)
                    )
                )
            ),
            React.createElement('div', { 
                className: "text-center",
                style: { 
                    position: 'absolute',
                    bottom: '0',
                    left: '0',
                    right: '0',
                    backgroundColor: 'white'
                }
            },
                React.createElement('p', null, "Hover over cells to see dependencies"),
                React.createElement('div', { className: "flex justify-center gap-4 mt-2 flex-wrap" },
                    React.createElement('div', { className: "flex items-center" },
                        React.createElement('div', { className: "w-4 h-4 mr-1", style: { backgroundColor: '#a0d8ef' } }),
                        React.createElement('span', null, "A: Independent")
                    ),
                    React.createElement('div', { className: "flex items-center" },
                        React.createElement('div', { className: "w-4 h-4 mr-1", style: { backgroundColor: '#f8b862' } }),
                        React.createElement('span', null, "B: Depends on A")
                    ),
                    React.createElement('div', { className: "flex items-center" },
                        React.createElement('div', { className: "w-4 h-4 mr-1", style: { backgroundColor: '#8db255' } }),
                        React.createElement('span', null, "C: Depends on A,B")
                    ),
                    React.createElement('div', { className: "flex items-center" },
                        React.createElement('div', { className: "w-4 h-4 mr-1", style: { backgroundColor: '#d3381c' } }),
                        React.createElement('span', null, "D: Depends on A,B,C")
                    )
                )
            )
        )
    );
};

ReactDOM.render(
    React.createElement(BlockGrid, null),
    document.getElementById('root')
);