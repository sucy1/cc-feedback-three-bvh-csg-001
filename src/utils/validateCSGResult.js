import { Vector3 } from 'three';

const _va = new Vector3();
const _vb = new Vector3();
const _vc = new Vector3();
const _ab = new Vector3();
const _ac = new Vector3();

// Issue codes reported by validateCSGResult
export const GROUP_GAP = 'GROUP_GAP';
export const GROUP_OVERLAP = 'GROUP_OVERLAP';
export const EMPTY_GROUP = 'EMPTY_GROUP';
export const GROUP_MATERIAL_OUT_OF_RANGE = 'GROUP_MATERIAL_OUT_OF_RANGE';
export const UNDEFINED_MATERIAL = 'UNDEFINED_MATERIAL';
export const DEGENERATE_TRIANGLE = 'DEGENERATE_TRIANGLE';

// Validates the group / material structure of a CSG result brush. Returns
// { ok: boolean, issues: [ { code, path, message } ] }.
export function validateCSGResult( brush ) {

	const issues = [];
	const geometry = brush.geometry;
	const materials = Array.isArray( brush.material ) ? brush.material : [ brush.material ];

	const index = geometry.index;
	const position = geometry.attributes.position;
	const vertexCount = index ? index.count : ( position ? position.count : 0 );

	// validate that every referenced material slot is defined
	for ( let i = 0, l = materials.length; i < l; i ++ ) {

		if ( materials[ i ] === undefined || materials[ i ] === null ) {

			issues.push( {
				code: UNDEFINED_MATERIAL,
				path: `material[ ${ i } ]`,
				message: `Material slot ${ i } is ${ materials[ i ] }.`,
			} );

		}

	}

	// validate that the groups are sorted, non overlapping, and completely
	// cover the geometry index without gaps or empty ranges
	const groups = geometry.groups || [];
	let cursor = 0;
	for ( let i = 0, l = groups.length; i < l; i ++ ) {

		const group = groups[ i ];
		const path = `geometry.groups[ ${ i } ]`;

		if ( group.count === 0 ) {

			issues.push( {
				code: EMPTY_GROUP,
				path: `${ path }.count`,
				message: `Group ${ i } has a count of 0.`,
			} );

		}

		if ( group.start < cursor ) {

			issues.push( {
				code: GROUP_OVERLAP,
				path: `${ path }.start`,
				message: `Group ${ i } starts at ${ group.start } which overlaps the previous group ending at ${ cursor }.`,
			} );

		} else if ( group.start > cursor ) {

			issues.push( {
				code: GROUP_GAP,
				path: `${ path }.start`,
				message: `Group ${ i } starts at ${ group.start } leaving a gap after index ${ cursor }.`,
			} );

		}

		if (
			! Number.isInteger( group.materialIndex ) ||
			group.materialIndex < 0 ||
			group.materialIndex >= materials.length
		) {

			issues.push( {
				code: GROUP_MATERIAL_OUT_OF_RANGE,
				path: `${ path }.materialIndex`,
				message: `Group ${ i } references materialIndex ${ group.materialIndex } but only ${ materials.length } material(s) are available.`,
			} );

		}

		cursor = Math.max( cursor, group.start + group.count );

	}

	if ( cursor < vertexCount ) {

		issues.push( {
			code: GROUP_GAP,
			path: 'geometry.groups',
			message: `Groups only cover ${ cursor } of ${ vertexCount } vertex indices.`,
		} );

	} else if ( cursor > vertexCount ) {

		issues.push( {
			code: GROUP_OVERLAP,
			path: 'geometry.groups',
			message: `Groups cover ${ cursor } vertex indices but the geometry only contains ${ vertexCount }.`,
		} );

	}

	// validate that no indexed triangle is degenerate
	if ( position ) {

		for ( let i = 0; i < vertexCount; i += 3 ) {

			const i0 = index ? index.getX( i ) : i;
			const i1 = index ? index.getX( i + 1 ) : i + 1;
			const i2 = index ? index.getX( i + 2 ) : i + 2;

			let degenerate = i0 === i1 || i1 === i2 || i2 === i0;
			if ( ! degenerate ) {

				_va.fromBufferAttribute( position, i0 );
				_vb.fromBufferAttribute( position, i1 );
				_vc.fromBufferAttribute( position, i2 );
				_ab.subVectors( _vb, _va );
				_ac.subVectors( _vc, _va );
				degenerate = _ab.cross( _ac ).lengthSq() === 0;

			}

			if ( degenerate ) {

				issues.push( {
					code: DEGENERATE_TRIANGLE,
					path: index ? `geometry.index[ ${ i } ]` : `geometry.attributes.position[ ${ i } ]`,
					message: `Triangle ${ i / 3 } has zero area or repeated vertices (${ i0 }, ${ i1 }, ${ i2 }).`,
				} );

			}

		}

	}

	return {
		ok: issues.length === 0,
		issues,
	};

}
