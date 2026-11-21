import {
	Brush,
	Evaluator,
	SUBTRACTION,
	ADDITION,
	INTERSECTION,
	DIFFERENCE,
	validateCSGResult,
} from '../src';
import {
	BoxGeometry,
	BufferGeometry,
	BufferAttribute,
	MeshStandardMaterial,
} from 'three';

// creates a brush with six material groups and six distinct, named materials
function makeMultiMaterialBrush( label, size = 1 ) {

	const geometry = new BoxGeometry( size, size, size );
	const materials = [ 0, 1, 2, 3, 4, 5 ].map( i => {

		const material = new MeshStandardMaterial();
		material.name = `${ label }_${ i }`;
		return material;

	} );

	return new Brush( geometry, materials );

}

function getMaterials( brush ) {

	return Array.isArray( brush.material ) ? brush.material : [ brush.material ];

}

// asserts that the geometry groups are sorted, contiguous, fully cover the
// index, and contain only whole triangles
function expectWellFormedGroups( brush ) {

	const groups = brush.geometry.groups;
	const indexCount = brush.geometry.index.count;

	let cursor = 0;
	for ( let i = 0; i < groups.length; i ++ ) {

		const group = groups[ i ];
		expect( group.start ).toBe( cursor );
		expect( group.count ).toBeGreaterThan( 0 );
		expect( group.count % 3 ).toBe( 0 );
		cursor += group.count;

	}

	expect( cursor ).toBe( indexCount );

}

describe( 'multi material group preservation', () => {

	it( 'preserves all twelve group slots when both brushes use six materials', () => {

		const evaluator = new Evaluator();

		const a = makeMultiMaterialBrush( 'A', 2 );
		a.updateMatrixWorld();

		// brush B is fully inside brush A so all six of its groups contribute triangles
		const b = makeMultiMaterialBrush( 'B', 1 );
		b.updateMatrixWorld();

		const result = evaluator.evaluate( a, b, SUBTRACTION );
		const materials = getMaterials( result );
		const groups = result.geometry.groups;

		expect( groups ).toHaveLength( 12 );
		expect( materials ).toHaveLength( 12 );

		// every group points at a valid, distinct material slot
		for ( const group of groups ) {

			expect( group.materialIndex ).toBeGreaterThanOrEqual( 0 );
			expect( group.materialIndex ).toBeLessThan( materials.length );

		}

		// brush A's and brush B's materials are all preserved in order
		for ( let i = 0; i < 6; i ++ ) {

			expect( materials[ i ] ).toBe( a.material[ i ] );
			expect( materials[ 6 + i ] ).toBe( b.material[ i ] );
			expect( groups[ i ].materialIndex ).toBe( i );
			expect( groups[ 6 + i ].materialIndex ).toBe( 6 + i );

		}

		expectWellFormedGroups( result );
		expect( validateCSGResult( result ).ok ).toBe( true );

	} );

	it( 'keeps the used slots from both brushes on partial overlap', () => {

		const evaluator = new Evaluator();

		const a = makeMultiMaterialBrush( 'A' );
		a.updateMatrixWorld();

		const b = makeMultiMaterialBrush( 'B' );
		b.position.x = 0.5;
		b.updateMatrixWorld();

		const result = evaluator.evaluate( a, b, SUBTRACTION );
		const materials = getMaterials( result );
		const groups = result.geometry.groups;

		// five of A's faces and one of B's faces survive
		expect( groups ).toHaveLength( 6 );
		expect( materials ).toHaveLength( 6 );

		// materials from both brushes are present and every index is in range
		expect( materials ).toContain( b.material[ 1 ] );
		for ( const group of groups ) {

			expect( group.materialIndex ).toBeLessThan( materials.length );
			expect( materials[ group.materialIndex ] ).toBeDefined();

		}

		expectWellFormedGroups( result );
		expect( validateCSGResult( result ).ok ).toBe( true );

	} );

	it( 'produces well formed groups for every operation', () => {

		const evaluator = new Evaluator();

		for ( const operation of [ SUBTRACTION, ADDITION, INTERSECTION, DIFFERENCE ] ) {

			const a = makeMultiMaterialBrush( 'A' );
			a.updateMatrixWorld();

			const b = makeMultiMaterialBrush( 'B' );
			b.position.set( 0.5, 0.5, 0.5 );
			b.updateMatrixWorld();

			const result = evaluator.evaluate( a, b, operation );
			const materials = getMaterials( result );

			expectWellFormedGroups( result );
			for ( const group of result.geometry.groups ) {

				expect( group.materialIndex ).toBeLessThan( materials.length );

			}

			expect( validateCSGResult( result ).ok ).toBe( true );

		}

	} );

} );

describe( 'consolidateGroups', () => {

	it( 'does not merge groups across brushes when false', () => {

		const evaluator = new Evaluator();
		evaluator.consolidateGroups = false;
		evaluator.removeUnusedMaterials = false;

		const a = makeMultiMaterialBrush( 'A', 2 );
		a.updateMatrixWorld();

		const b = makeMultiMaterialBrush( 'B', 1 );
		// share a material object between the two brushes
		b.material[ 1 ] = a.material[ 1 ];
		b.updateMatrixWorld();

		const result = evaluator.evaluate( a, b, SUBTRACTION );
		const materials = getMaterials( result );
		const groups = result.geometry.groups;

		// no consolidation: all twelve slots are kept in order even though
		// two slots reference the same material object
		expect( groups ).toHaveLength( 12 );
		expect( materials ).toHaveLength( 12 );
		expect( groups.map( g => g.materialIndex ) ).toEqual( [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 ] );
		expect( materials[ 7 ] ).toBe( a.material[ 1 ] );

		expectWellFormedGroups( result );
		expect( validateCSGResult( result ).ok ).toBe( true );

	} );

	it( 'merges only groups pointing at the same material object when true', () => {

		const evaluator = new Evaluator();
		evaluator.consolidateGroups = true;
		evaluator.removeUnusedMaterials = true;

		const a = makeMultiMaterialBrush( 'A', 2 );
		a.updateMatrixWorld();

		const b = makeMultiMaterialBrush( 'B', 1 );
		const shared = a.material[ 1 ];
		b.material[ 1 ] = shared;
		b.updateMatrixWorld();

		const result = evaluator.evaluate( a, b, SUBTRACTION );
		const materials = getMaterials( result );
		const groups = result.geometry.groups;

		// eleven unique material objects remain
		expect( materials ).toHaveLength( 11 );
		expect( groups ).toHaveLength( 11 );

		// the shared material's group spans both brushes' triangles
		const sharedGroup = groups.find( g => materials[ g.materialIndex ] === shared );
		expect( sharedGroup.count ).toBe( 12 );

		// every remaining material object is referenced by exactly one group
		for ( const material of materials ) {

			const referencing = groups.filter( g => materials[ g.materialIndex ] === material );
			expect( referencing ).toHaveLength( 1 );

		}

		expectWellFormedGroups( result );
		expect( validateCSGResult( result ).ok ).toBe( true );

	} );

	it( 'does not merge groups that merely share a group index', () => {

		const evaluator = new Evaluator();
		evaluator.consolidateGroups = true;
		evaluator.removeUnusedMaterials = true;

		const a = makeMultiMaterialBrush( 'A', 2 );
		a.updateMatrixWorld();

		// all twelve materials are distinct objects, so no groups may merge
		// even though both brushes use group indices 0..5
		const b = makeMultiMaterialBrush( 'B', 1 );
		b.updateMatrixWorld();

		const result = evaluator.evaluate( a, b, SUBTRACTION );

		expect( result.geometry.groups ).toHaveLength( 12 );
		expect( getMaterials( result ) ).toHaveLength( 12 );

		expectWellFormedGroups( result );
		expect( validateCSGResult( result ).ok ).toBe( true );

	} );

} );

describe( 'removeUnusedMaterials', () => {

	it( 'removes only unreferenced slots and remaps group indices when true', () => {

		const evaluator = new Evaluator();
		evaluator.removeUnusedMaterials = true;

		const a = makeMultiMaterialBrush( 'A' );
		a.updateMatrixWorld();

		const b = makeMultiMaterialBrush( 'B' );
		b.position.x = 0.5;
		b.updateMatrixWorld();

		const result = evaluator.evaluate( a, b, SUBTRACTION );
		const materials = getMaterials( result );
		const groups = result.geometry.groups;

		// every remaining material is referenced and the indices are densely remapped
		const referenced = new Set( groups.map( g => g.materialIndex ) );
		expect( referenced.size ).toBe( materials.length );
		expect( Math.max( ...referenced ) ).toBe( materials.length - 1 );
		for ( const material of materials ) {

			expect( material ).toBeDefined();

		}

		expectWellFormedGroups( result );
		expect( validateCSGResult( result ).ok ).toBe( true );

	} );

	it( 'keeps both brushes original material slots when false', () => {

		const evaluator = new Evaluator();
		evaluator.consolidateGroups = false;
		evaluator.removeUnusedMaterials = false;

		const a = makeMultiMaterialBrush( 'A' );
		a.updateMatrixWorld();

		const b = makeMultiMaterialBrush( 'B' );
		b.position.x = 0.5;
		b.updateMatrixWorld();

		const result = evaluator.evaluate( a, b, SUBTRACTION );
		const materials = getMaterials( result );
		const groups = result.geometry.groups;

		// all twelve original slots are preserved even though only seven are used
		expect( materials ).toHaveLength( 12 );
		expect( groups ).toHaveLength( 6 );

		// the surviving groups point at the original slots on both sides
		expect( new Set( groups.map( g => g.materialIndex ) ) ).toEqual( new Set( [ 1, 2, 3, 4, 5, 7 ] ) );
		expect( materials[ 1 ] ).toBe( a.material[ 1 ] );
		expect( materials[ 7 ] ).toBe( b.material[ 1 ] );

		expectWellFormedGroups( result );
		expect( validateCSGResult( result ).ok ).toBe( true );

	} );

} );

describe( 'validateCSGResult', () => {

	function makeValidResult() {

		const evaluator = new Evaluator();

		const a = makeMultiMaterialBrush( 'A', 2 );
		a.updateMatrixWorld();

		const b = makeMultiMaterialBrush( 'B', 1 );
		b.updateMatrixWorld();

		return evaluator.evaluate( a, b, SUBTRACTION );

	}

	it( 'reports ok for a valid multi material result', () => {

		const result = makeValidResult();
		const validation = validateCSGResult( result );

		expect( validation.ok ).toBe( true );
		expect( validation.issues ).toEqual( [] );

	} );

	it( 'reports EMPTY_GROUP when a group count is zero', () => {

		const result = makeValidResult();
		result.geometry.groups[ 0 ].count = 0;

		const validation = validateCSGResult( result );
		expect( validation.ok ).toBe( false );

		const issue = validation.issues.find( i => i.code === 'EMPTY_GROUP' );
		expect( issue ).toBeDefined();
		expect( issue.path ).toContain( 'geometry.groups[ 0 ]' );
		expect( typeof issue.message ).toBe( 'string' );

	} );

	it( 'reports GROUP_MATERIAL_OUT_OF_RANGE when a materialIndex exceeds the material list', () => {

		const result = makeValidResult();
		result.geometry.groups[ 0 ].materialIndex = 99;

		const validation = validateCSGResult( result );
		expect( validation.ok ).toBe( false );

		const issue = validation.issues.find( i => i.code === 'GROUP_MATERIAL_OUT_OF_RANGE' );
		expect( issue ).toBeDefined();
		expect( issue.path ).toContain( 'geometry.groups[ 0 ]' );
		expect( typeof issue.message ).toBe( 'string' );

	} );

	it( 'reports GROUP_GAP and GROUP_OVERLAP for broken group coverage', () => {

		const gapResult = makeValidResult();
		gapResult.geometry.groups[ 1 ].start += 3;

		const gapValidation = validateCSGResult( gapResult );
		expect( gapValidation.ok ).toBe( false );
		expect( gapValidation.issues.some( i => i.code === 'GROUP_GAP' ) ).toBe( true );

		const overlapResult = makeValidResult();
		overlapResult.geometry.groups[ 1 ].start -= 3;

		const overlapValidation = validateCSGResult( overlapResult );
		expect( overlapValidation.ok ).toBe( false );
		expect( overlapValidation.issues.some( i => i.code === 'GROUP_OVERLAP' ) ).toBe( true );

	} );

	it( 'reports UNDEFINED_MATERIAL for undefined material slots', () => {

		const result = makeValidResult();
		result.material[ 2 ] = undefined;

		const validation = validateCSGResult( result );
		expect( validation.ok ).toBe( false );

		const issue = validation.issues.find( i => i.code === 'UNDEFINED_MATERIAL' );
		expect( issue ).toBeDefined();
		expect( issue.path ).toContain( 'material[ 2 ]' );

	} );

	it( 'reports DEGENERATE_TRIANGLE for zero area and repeated index triangles', () => {

		// zero area triangle
		const flatGeometry = new BufferGeometry();
		flatGeometry.setAttribute( 'position', new BufferAttribute( new Float32Array( [
			0, 0, 0,
			1, 0, 0,
			0, 0, 0,
		] ), 3 ) );
		flatGeometry.setIndex( [ 0, 1, 2 ] );
		flatGeometry.addGroup( 0, 3, 0 );

		const flatBrush = new Brush( flatGeometry, new MeshStandardMaterial() );
		const flatValidation = validateCSGResult( flatBrush );
		expect( flatValidation.ok ).toBe( false );
		expect( flatValidation.issues.some( i => i.code === 'DEGENERATE_TRIANGLE' ) ).toBe( true );

		// repeated vertex indices
		const repeatedGeometry = new BufferGeometry();
		repeatedGeometry.setAttribute( 'position', new BufferAttribute( new Float32Array( [
			0, 0, 0,
			1, 0, 0,
			0, 1, 0,
		] ), 3 ) );
		repeatedGeometry.setIndex( [ 0, 0, 1 ] );
		repeatedGeometry.addGroup( 0, 3, 0 );

		const repeatedBrush = new Brush( repeatedGeometry, new MeshStandardMaterial() );
		const repeatedValidation = validateCSGResult( repeatedBrush );
		expect( repeatedValidation.ok ).toBe( false );
		expect( repeatedValidation.issues.some( i => i.code === 'DEGENERATE_TRIANGLE' ) ).toBe( true );

	} );

	it( 'returns issues with code, path, and message fields', () => {

		const result = makeValidResult();
		result.geometry.groups[ 0 ].count = 0;

		const validation = validateCSGResult( result );
		expect( validation.issues.length ).toBeGreaterThan( 0 );
		for ( const issue of validation.issues ) {

			expect( typeof issue.code ).toBe( 'string' );
			expect( typeof issue.path ).toBe( 'string' );
			expect( typeof issue.message ).toBe( 'string' );

		}

	} );

} );
