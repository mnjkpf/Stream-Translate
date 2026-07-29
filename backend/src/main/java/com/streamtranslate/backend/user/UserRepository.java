package com.streamtranslate.backend.user;


import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<UUID, Users>{
    Optional<Users> findByGoogleSub(String googleSub);
}
