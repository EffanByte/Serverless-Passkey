import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

export default function Starfield() {
    const mountRef = useRef();

    useEffect(() => {
        console.log('Starfield mounted');
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 60;
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({
            canvas: mountRef.current,
            alpha: true,
            antialias: true
        });
        renderer.setSize(window.innerWidth, window.innerHeight);

        const geoStar = new THREE.SphereGeometry(0.12, 8, 8);
        const matStar = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const stars = [];

        for (let i = 0; i < 500; i++) {
            const s = new THREE.Mesh(geoStar, matStar.clone());
            s.position.set(
                (Math.random() - 0.5) * 200,  // wider spread
                (Math.random() - 0.5) * 200,
                (Math.random() - 0.5) * 200
            );
            scene.add(s);
            stars.push(s);
        }

        function animateStars() {
            requestAnimationFrame(animateStars);
            stars.forEach(s => {
                s.position.z += 0.1;
                if (s.position.z > 100) s.position.z = -100;
            });
            renderer.render(scene, camera);
        }

        animateStars();

        function handleResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            renderer.dispose();
        };
    }, []);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            overflow: 'hidden',
            background: '#0b0c10',
            zIndex: 1
        }}>
            <canvas
                ref={mountRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                }}
            />
        </div>
    );
} 